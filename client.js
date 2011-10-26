
$(function(){
    Game.init();
});

var Game = {
    socket: null,
    players: {
        
    },
    init: function(){
        this.setupConnection();
        this.setupJoinForm();
        
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
        })
        $name.val(localStorage.getItem('playerName'));
        updateRobohash();
        
        var $form = $('form.join');
        $form.find(':input').prop('disabled', false);
        $form.submit(function(){
            updateRobohash();
            $form.find(':input').prop('disabled', true);
            localStorage.setItem('playerName', $name.val());
            that.socket.emit('playerJoin', {name: $name.val()});
        });
        
        this.socket.on('playerJoinSuccess', function(player){
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
        });
        
        this.socket.on('playerJoinFailure', function(error){
            $form.find(':input').prop('disabled', false);
            alert(error);
            $name.focus();
        });
    },
    
    getRobohashURL: function(name, size){
        size = size || 50;
        return "//static1.robohash.com/" + encodeURIComponent(name) + ".png?set=set3&size=" + size + "x" + size;
    }
};
