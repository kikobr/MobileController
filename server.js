
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



/* Example extracted from https://github.com/adelura/socket.io-express-solution */
var session = require('express-session'),
	cookie = require('cookie'),
	cookieParser = require('cookie-parser'),
	sessionStore = new session.MemoryStore(),
	MobileDetect = require('mobile-detect');


// Cookies Config
var COOKIE_SECRET = 'secret-mobile-controller';
var COOKIE_NAME = 'mobileControllerId';


// Setting middlewares
app.use(cookieParser(COOKIE_SECRET));
app.use(session({
	name: COOKIE_NAME,
	store: sessionStore,
	secret: COOKIE_SECRET,
	saveUninitialized: true,
	resave: true,
	cookie: {
		path: '/',
		httpOnly: true,
		secure: false,
		maxAge: null
	}
}));

// Generate simple random password
function randomPassword(length) {
  chars = "abcdefghijklmnopqrstuvwxyz1234567890";
  pass = "";
  for(x=0;x<length;x++) {
    i = Math.floor(Math.random() * chars.length);
    pass += chars.charAt(i);
  }
  return pass;
}

// This will be run once, in the handshake
io.use(function(socket, next) {
	try {
		
		var data = socket.handshake || socket.request;

		if (! data.headers.cookie) { return next(new Error('Missing cookie headers')); }

		// Getting Cookies
		var cookies = cookie.parse(data.headers.cookie);
		
		// If there's no custom cookie
		if (! cookies[COOKIE_NAME]) { return next(new Error('Missing cookie ' + COOKIE_NAME)); }

		// Getting custom cookie
		var sid = cookieParser.signedCookie(cookies[COOKIE_NAME], COOKIE_SECRET);
		if (! sid) { return next(new Error('Cookie signature is not valid')); }

		// Can be get by socket.handshake.sid
		data.sid = sid;

		// Creating the value on store
		sessionStore.get(sid, function(err, session) {
			if (err) return next(err);
			if (!session) return next(new Error('session not found'));
			
			// Check if it's mobile
			session.isMobile = new MobileDetect(data.headers['user-agent']).mobile() != null ? true : false;

			// Generate a sync password if none
			if(!session.syncPassword){
				session.syncPassword = randomPassword(4);
				session.syncedTo = false;
			}
			
			// Applying session
			data.session = session;
			sessionStore.set(sid, session);
			next();
		});

	} catch (err) {
		console.error(err.stack);
		next(new Error('Internal server error'));
	}
});



// Online vars
var clients = [];


// Socket.IO
io.on('connection', function(socket) {
    clients.push(socket);

    var _sid 			= socket.handshake.sid,
    	_session 		= socket.handshake.session,
    	syncPassword 	= _session.syncPassword,
    	isMobile 		= _session.isMobile;

    console.log(_session);
	
	// Initializing
	if(!isMobile){
		socket.emit('showSyncPassword', _session.syncPassword);
	} else {
		socket.emit('requestSyncPassword');
	}

	// Trying to sync on password
	socket.on('syncPassword', function(password){
		try {
			var regexp = new RegExp("^"+password+"$","i");
			// Check if matches any socket
			var matchesSomeone = false;
			clients.forEach(function(_socket){
				// Check only non-synced and desktops
				if(!_socket.handshake.session.syncedTo && !_socket.handshake.session.isMobile){
					// Check if this non-synced matches 
					if(_socket.handshake.session.syncPassword.match(regexp)){
						// Sync'em
						var _socket_sid = _socket.handshake.sid;
						// sync desktop to mobile socket
						sessionStore.get(_socket_sid, function(err, session) {
					      session.syncedTo = _sid;
					      sessionStore.set(_socket_sid, session);
					      _socket.handshake.session = session; // update actual socket before refresh
					    });
						// sync mobile to desktop socket
						sessionStore.get(_sid, function(err, session) {
					      session.syncedTo = _socket_sid;
					      sessionStore.set(_sid, session);
					      _session = session; // update actual socket before refresh
					    });
						matchesSomeone = true;
						// emit events
						socket.emit('mobileSynced');
						_socket.emit('desktopSynced');
						return false;
					}
				}
			});
			if(!matchesSomeone){ console.log('it doesnt match anyone'); }
		} catch(err){ console.log(err); }
	});

	// Syncing from mobile to desktop
	socket.on('syncDesktopName', function(name){
		// find sync
		getSynced(_session.syncedTo, function(socket){
			socket.emit('syncDesktopName', name);
		});
	});

	// Return a synced device
	function getSynced(syncedTo, fn){
		var found = false;
		clients.forEach(function(_socket){
			// Search only for desktops
			if(!_socket.handshake.session.isMobile){
				console.log('ok');
				if(_socket.handshake.sid == syncedTo){
					console.log('done');
					found = _socket;
					return false; // break loop
				}
			}
		});
		if(found){ return fn(found); }
		else { return found; }
	}

	


    socket.broadcast.emit('someone-connected', clients.length);
	socket.on('disconnect', function(){
		clients.splice(clients.indexOf(socket), 1); // disconnects
		socket.broadcast.emit('someone-disconnected', clients.length);
	});
});






// Router
app.get('/', function(req, res, next){
	return res.render('index');
});