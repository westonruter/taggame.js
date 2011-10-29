
$(function(){
    Game.init();
});

var Game = {
    socket: null,
    players: [],
    playerElements: {},
    myPlayerId: null,
    
    init: function(){
        this.setupConnection();
        this.setupJoinForm();
        this.setupPlayerUpdates();
        
        // Show UI
        $('.loading').remove();
        $('.game').removeAttr('hidden').show();
    },
    
    setupConnection: function(){
        var socket = this.socket = io.connect('//' + window.location.host);
        var that = this;
    },
    
    setupJoinForm: function(){
        var that = this;
        var updateTimer = null;
        var $name = $('form.join [name=name]');
        var $img = $('form.join .robohash img');
        $name.bind('input', function(){
            $img.addClass('loading');
            clearInterval(updateTimer); // Be kind to RoboHash
            updateTimer = setTimeout(updateRobohash, 750);
        });
        
        // @todo on('playersOnline') update setValidity on $name
        
        function updateRobohash(){
            clearInterval(updateTimer);
            var hasValue = !!$name.val();
            $('.robohash').toggle(hasValue);
            if(hasValue){
                $img.attr('src', that.getRobohashURL($name.val(), 150));
            }
            else {
                $img.removeAttr('src');
            }
        }
        $img.load(function(){
            $(this).removeClass('loading');
        });
        $name.val(localStorage.getItem('playerName'));
        updateRobohash();
        
        var $form = $('form.join');
        $form.find(':input').prop('disabled', false);
        $form.submit(function(){
            updateRobohash();
            $form.find(':input').prop('disabled', true);
            localStorage.setItem('playerName', $name.val());
            that.socket.emit('playerJoinRequest', {name: $name.val()});
        });
        
        this.socket.on('playerJoinSuccess', function(){
            // Get rid of the form
            $form.animate(
                {
                    top: -1000,
                    opacity: 0.0
                },
                {
                    duration: 500,
                    complete: function(){
                        $form.remove();
                    }
                }
            );
            $('.field').focus();
        });
        
        this.socket.on('playerJoinFailure', function(error){
            $form.find(':input').prop('disabled', false);
            alert(error);
            $name.focus();
        });
    },
    
    
    setupPlayerUpdates: function(){
        var that = this;
        this.socket.on('playersUpdate', function(players){
            that.players = players;
            that.renderPlayers();
        });
        
        this.socket.on('playerLeave', function(player){
            if(that.playerElements[player.id]){
                $(that.playerElements[player.id]).remove();
                delete that.playerElements[player.id];
            }
        });
        this.socket.on('playerJoin', function(player){
            
        });
        
        var $field = $('.field');
        $field.mousemove(function(e){
            // @todo This needs to not be set here, but rather in a socket from the server with the value from there
            //$me.css({
            //    top: y,
            //    left: x
            //});
            that.socket.emit('playerMove', {
                x: e.layerX,
                y: e.layerY
            });
        });
        
        this.socket.on('playerMoved', function(player){
            var $img = $('#' + player.id);
            if($img.length){
                $img.css({
                    left: player.x - $img.width()/2,
                    top:  player.y - $img.height()/2
                });
            }
        });
        
    },
    
    renderPlayers: function(){
        var that = this;
        _(this.players).each(function(player){
            var $img;
            if(!that.playerElements[player.id]){
                $img = $('<img/>', {
                    id: player.id,
                    src: that.getRobohashURL(player.name, Math.min(player.width, player.height)),
                    width: player.width,
                    height: player.height
                });
                $('.field').append($img);
                that.playerElements[player.id] = $img;
            }
            else {
                $img = $(that.playerElements[player.id]);
            }
            $img.css({
                left: player.x,
                top: player.y
            });
            $img.toggleClass('me', player.isSelf);
        });
    },
    
    getRobohashURL: function(name, size){
        return "//static1.robohash.com/" + encodeURIComponent(name) + ".png?set=set3&size=" + size + "x" + size;
    }
};
