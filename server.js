var server = require('http').createServer(handler);
var io = require('socket.io').listen(server);
var fs = require('fs');
var _ = require('underscore');
var crypto = require('crypto');
const port = 8001; // @todo Allow argv to define this?
server.listen(port);

 // @todo These need to be DRYly defined here and in the template
const BOARD_WIDTH_PX = 600; // @todo Should these be percentages instead?
const BOARD_HEIGHT_PX = 600;
const POSITION_UPDATE_INTERVAL_MS = 1000;
const NO_TAGBACKS_DURATION_MS = 5000;
const PLAYER_MAX_SPEED = 10.0; // pixels per second

// Todo: Move PLayer and PlayerRegistry into models.js?

const ID_SALT = Math.random().toString();

function Player(params){
    var defaults = {
        width: 100, //px
        height: 100, //px
        radius: 50, //px
        taggable: true,
        isIt: false,
        itCount: 0,
        lastTimeIt: null,
        isSelf: false,
        x: Math.round(BOARD_WIDTH_PX  * Math.random()),
        y: Math.round(BOARD_HEIGHT_PX * Math.random()),
        direction: 0.0, // rad or deg?
        speed: 0.0 // pixels per second?
    };
    _.extend(this, defaults, params);
    
    var shasum = crypto.createHash('sha1');
    shasum.update(ID_SALT + this.sessionId + this.name);
    this.id = shasum.digest('hex');
}
Player.prototype.setIt = function(isIt){
    if(isIt){
        if(!this.isIt){
            this.isIt = true;
            // @todo this.taggable = false;
            this.itCount += 1;
            io.sockets.emit('playerIt', this.cloneForClient());
        }
    }
    else {
        if(this.isIt){
            this.isIt = false;
            this.taggable = false;
            this.lastTimeIt = new Date();
            
            var player = this.cloneForClient();
            io.sockets.emit('playerNotIt', player);
            
            io.sockets.emit('playerUntaggable', player);
            var that = this;
            setTimeout(function(){
                player.taggable = that.taggable = true;
                io.sockets.emit('playerTaggable', player);
            }, NO_TAGBACKS_DURATION_MS);
        }
    }
};
Player.prototype.cloneForClient = function(socket){
    var player = _(this).clone();
    if(socket){
        player.isSelf = (socket.id === player.sessionId);
    }
    delete player.sessionId;
    delete player.socket;
    return player;
};

var openSockets = {};

var PlayerRegistry = _.extend([], {
    add: function(params){
        var player = new Player(params);
        if(this.length == 0){
            player.setIt(true);
        }
        this.push(player);
        return player;
    },
    
    remove: function(player){
        var sessionId = player.sessionId;
        var sessionIds = _(this).pluck('sessionId');
        var position = _(sessionIds).indexOf(sessionId);
        if(position >= 0){
            this.splice(position, 1);
            // Ensure that someone is always it, here the last person to join becomes it
            if(player.isIt && this.length > 0){
                this[this.length-1].isIt = true;
            }
            return true;
        }
        else {
            return false;
        }
    },
    
    nameExists: function(name){
        return !!this.getBy('name', name);
    },
    
    getBy: function(field, id){
        return _(this).find(function(player){
            return player[field] == id;
        });
    },
    
    cloneAllForClient: function(socket){
        // We remove the id from the players returned to the client to avoid cheating, by clients making fraudulent requests 
        var players = [];
        _(this).each(function(player){
            players.push(player.cloneForClient(socket));
        });
        return players;
    }
});


/**
 * @todo This sucks. Need a better way to handle static assets
 * @todo Use Express
 */
function handler (req, res) {
    var publicFiles = [
        '/index.html',
        '/client.js',
        '/style.css'
    ];
    
    var path = req.url;
    if(path == '/'){
        path = '/index.html';
    }
    
    if(publicFiles.indexOf(path) !== -1){
        fs.readFile(__dirname + path, function (err, data) {
            if (err) {
                res.writeHead(500);
                return res.end('Error loading ' + path);
            }
            var headers = {};
            if(publicFiles.indexOf('.css') != -1){
                headers['Content-Type'] = 'text/css; charset=utf-8';
            }
            else if(publicFiles.indexOf('.html') != -1){
                headers['Content-Type'] = 'text/html; charset=utf-8';
            }
            else if(publicFiles.indexOf('.js') != -1){
                headers['Content-Type'] = 'text/javascript; charset=utf-8';
            }
            res.writeHead(200, headers);
            res.end(data);
        });
    }
}

/**
 * Game events
 */
io.sockets.on('connection', function (socket) {
    openSockets[socket.id] = socket;
    
    socket.on('requestPlayersUpdate', function(){
        broadcastPlayersUpdate();
    });
    
    socket.on('playerJoinRequest', function (params) {
        if(typeof params.name === 'undefined'){
            socket.emit('playerJoinFailure', "You failed to provide a name.");
        }
        else if(PlayerRegistry.nameExists(params.name)){
            socket.emit('playerJoinFailure', "There is already a player using that name.");
        }
        else {
            var player = PlayerRegistry.add({
                sessionId: socket.id,
                socket: socket,
                joined: new Date(),
                name: params.name
            });
            socket.emit('playerJoinSuccess');
            io.sockets.emit('playerJoin', player.cloneForClient());
            broadcastPlayersUpdate();
        }
    });
    
    socket.on('playerMove', function(coordinates){
        var player = PlayerRegistry.getBy('sessionId', socket.id);
        if(player){
            player.x = parseInt(coordinates.x, 10);
            player.y = parseInt(coordinates.y, 10);
            io.sockets.emit('playerMoved', player.cloneForClient());
            
            // Detect if we are colliding with another player
            var otherPlayer, newlyTaggedPlayer, newlyUntaggedPlayer;
            for(var i = 0, len = PlayerRegistry.length; i < len; i++){
                otherPlayer = PlayerRegistry[i];
                
                if( !player.isIt && !otherPlayer.isIt ){
                    continue;
                }
                if( player.isIt && otherPlayer.isIt ){
                    continue;
                }
                
                var diffX = Math.abs(player.x - otherPlayer.x);
                var diffY = Math.abs(player.y - otherPlayer.y);
                var distance = Math.sqrt( Math.pow(diffX, 2) + Math.pow(diffY, 2) );
                
                if(distance <= player.radius*2){
                    newlyTaggedPlayer = player.isIt ? otherPlayer : player;
                    newlyUntaggedPlayer = player.isIt ? player : otherPlayer;
                    if(newlyTaggedPlayer.taggable){
                        newlyTaggedPlayer.setIt(true);
                        newlyUntaggedPlayer.setIt(false);
                        broadcastPlayersUpdate();
                    }
                }
            }
        }
    });
    
    socket.on('disconnect', function(){
        var player = PlayerRegistry.getBy('sessionId', socket.id);
        if(player){
            PlayerRegistry.remove(player);
            io.sockets.emit('playerLeave', player.cloneForClient());
            broadcastPlayersUpdate();
        }
        delete openSockets[socket.id];
    });
});

function broadcastPlayersUpdate(){
    _(openSockets).chain().values().each(function(socket){
        socket.emit('playersUpdate', PlayerRegistry.cloneAllForClient(socket));
    });
}
