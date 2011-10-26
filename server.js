var server = require('http').createServer(handler);
var io = require('socket.io').listen(server);
var fs = require('fs');
var _ = require('underscore');
var port = 8001;

server.listen(port);

// @todo We need to do better model management
var players = {};
function Player(params){
    _.extend(this, params);
}
function playerNameExists(name){
    return !!_(_(players).values()).find(function(player){
        return name === player.name;
    });
}

/**
 * @todo This sucks. Need a better way to handle static assets
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
    
    socket.on('playerJoin', function (params) {
        if(typeof params.name === 'undefined'){
            throw Error("Malformed player object");
        }
        
        if(playerNameExists(params.name)){
            socket.emit('playerJoinFailure', "There is already a player using that name.");
            return;
        }
        
        params.joined = new Date();
        var player = new Player(params);
        players[socket.id] = player;
        socket.emit('playerJoinSuccess', player);
        io.sockets.emit('playerJoin', player);
    });
    
    socket.on('disconnect', function(){
        io.sockets.emit('playerLeave', players[socket.id]);
        delete players[socket.id];
    });
    
});
