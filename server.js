
// Dependencies
var express = require('express'),
	app 	= express(),
	port 	= process.env.PORT || 3000,
	server 	= require('http').createServer(app).listen(port, function(){ console.log("Listening port %s", port); }),
	io 		= require('socket.io')(server);

// App and static content for the index.html
app.use(express.static('public'));
app.set('views', __dirname + '/views');
app.engine('ejs', require('ejs').renderFile);
app.set('view engine', 'ejs');

// Router
app.get('/', function(req, res, next){
	return res.render('index');
});

// Online vars
var online = 0;

// Socket.IO
io.on('connection', function(socket) {
    var addedUser = false;
    console.log("New user! -> %s", online);
    online ++;

    console.log(socket);

    socket.broadcast.emit('someone-connected', online);
	
	socket.on('disconnect', function(){
		online --;
		socket.broadcast.emit('someone-disconnected', online);
	});
});