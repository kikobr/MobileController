var app, io, session, cookie, cookieParser, sessionStore, MobileDetect;

// Cookies Config
var COOKIE_SECRET = 'secret-mobile-controller',
	COOKIE_NAME = 'mobileControllerId';
	logging = false,
	clients = [];

// Exporting module
module.exports = function(obj){
	app = obj.app || null;
	io = obj.io || null;
	logging = obj.logging || logging;

	if(!app || !io){
		throw new Error('You must pass express and socket.io instance as arguments in the module function: mb = require("./MobileController")({app:app, io:io})');
	}

	// Express cookie solution extracted from https://github.com/adelura/socket.io-express-solution
	session = require('express-session');
	cookie = require('cookie');
	cookieParser = require('cookie-parser');
	sessionStore = new session.MemoryStore();
	MobileDetect = require('mobile-detect');

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

	// This will be run once, in the handshake
	io.use(handshakeConfiguration);

	// Connection Handler
	io.on('connection', function(socket){
	    clients.push(socket); // managing online

	    var _sid 			= socket.handshake.sid,
	    	_session 		= socket.handshake.session,
	    	syncPassword 	= _session.syncPassword,
	    	isMobile 		= _session.isMobile;

	    logging ? console.log(_session) : '';
		
		// Initializing
		if(isMobile){
			socket.emit('mobileInit', {
				isSynced: _session.syncedTo ? true : false,
			});
		} else {
			socket.emit('desktopInit', {
				isSynced: _session.syncedTo ? true : false,
				syncPassword: _session.syncPassword
			});
		}
	});

	// Disconnection Handler
	io.on('disconnect', function(socket){
		clients.splice(clients.indexOf(socket), 1); // managing online
	})

	// PUBLIC
	this.randomPassword = randomPassword;
	this.clients = clients;
	this.sync = sync;
	this.getSynced = getSynced;

	// Done
	logging ? console.log('Module MobileController loaded') : '';
	return this;
}


// =====================================================================
// Configuration Functions
// =====================================================================
function handshakeConfiguration(socket, next){
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
}

// Syncing mobile to desktop
function sync(socket, password){

	// socket is probably mobile
    var _sid 			= socket.handshake.sid,
    	_session 		= socket.handshake.session,
    	syncPassword 	= _session.syncPassword,
    	isMobile 		= _session.isMobile;

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
					var _socket_sid = _socket.handshake.sid; // desktop
					// sync desktop to mobile socket
					sessionStore.get(_socket_sid, function(err, session) {
						session.syncedTo = _sid;
						sessionStore.set(_socket_sid, session);
						_socket.handshake.session = session; // update actual socket before refresh
						// emit events
						_socket.emit('desktopSynced');
				    });
					// sync mobile to desktop socket
					sessionStore.get(_sid, function(err, session) {
						session.syncedTo = _socket_sid;
						sessionStore.set(_sid, session);
						socket.handshake.session = session; // update actual socket before refresh
						// emit events
						socket.emit('mobileSynced');
				    });
					matchesSomeone = true;
					return false;
				}
			}
		});
		if(!matchesSomeone){
			socket.emit('mobileSyncFailed');
			console.log('it doesnt match anyone'); 
		}
	} catch(err){ console.log(err); }
}


// =====================================================================
// TOOLKIT
// =====================================================================
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
// Return a synced device
function getSynced(syncedTo, fn){
	var found = false;
	clients.forEach(function(_socket){
		// Search only for desktops
		if(!_socket.handshake.session.isMobile){
			if(_socket.handshake.sid == syncedTo){
				found = _socket;
				return false; // break loop
			}
		}
	});
	if(found){ return fn(found); }
	else { console.log('not'); return found; }
}