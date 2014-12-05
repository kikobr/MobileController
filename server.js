
// Dependencies
var express = require('express'),
	app 	= express(),
	port 	= process.env.PORT || 3000,
	server 	= require('http').createServer(app).listen(port, function(){ console.log("Listening port %s", port); }),
	io 		= require('socket.io')(server),
	mb 		= require('./MobileController')({ app: app, io: io, logging: false });

// App and static content for the index.html
app.use(express.static('public'));
app.set('views', __dirname + '/views');
app.engine('ejs', require('ejs').renderFile);
app.set('view engine', 'ejs');

// Socket.IO
io.on('connection', function(socket) {

	console.log(socket.handshake.sid);

	// STARTUP
	socket.on('mobileInit', function(data){
		socket.emit('requestSyncPassword', data.syncPassword);
	});
	socket.on('desktopInit', function(data){
		socket.emit('showSyncPassword', data.syncPassword);
	});

	// Trying to sync on password
	socket.on('syncPassword', function(desktopSyncPassword){ 
		mb.sync(socket, desktopSyncPassword);		
	});


	// Syncing from mobile to desktop
	socket.on('syncDesktopName', function(name){
		// find sync
		// console.log(socket.handshake.sid);
		// console.log(socket.handshake.session);
		mb.getSynced(socket.handshake.session.syncedTo, function(_socket){
			_socket.emit('syncDesktopName', name);
		});
	});	


    socket.broadcast.emit('someone-connected', clients.length);
	socket.on('disconnect', function(){
		socket.broadcast.emit('someone-disconnected', clients.length);
	});
});






// Router
app.get('/', function(req, res, next){
	return res.render('index');
});