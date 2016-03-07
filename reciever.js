/***  MLLP HL7 Reciever ***/

// Dependencies
var net = require('net');
var fs = require('fs');

/*
	Config class
	vars:
	baseFolder: Where to save the messages
	port      : What port to listen on
	ip        : what ip to listen on
*/
var Config = new function() {
	this.baseFolder = "data";
	this.port = 8070;
	this.ip = '127.0.0.1';
}

// MLP start and end frames
var startFrame = String.fromCharCode(11);
var endFrame = String.fromCharCode(28) + String.fromCharCode(13);

var dataString = "";

/*
	add startsWith to string to help with checking
	for correct segment
*/

if (typeof String.prototype.startsWith != 'function') {
	String.prototype.startsWith = function (str) {
		return this.indexOf(str) == 0;
	};
}

// Class that handles message processing and ACK building
var MsgHandler = new function() {
	this.message = "";
	this.fieldsep = "";
	this.compsep = "";
	this.buildAck = function () {
		this.fieldsep = this.message.substring(3,4);
		this.compsep = this.message.substring(4,5);

		var msh = "MSH" + this.fieldsep;
		var oldMsh = "";

		var segments = this.message.split("\r");

		for (var i = 0; i < segments.length; i++) {
			if (segments[i].startsWith("MSH")) {
				// found msh
				oldMsh = segments[i];
			}
		}

		// create new string array
		var oldMshArr = oldMsh.split(this.fieldsep);
		// reorder fields in MSH, and add the correct msg type
		/*
			Array values:
			0 - MSH
			1 - Encoding characters
			2 - Sending Application
			3 - Sending Facility
			4 - Receiving Application
			5 - Receiving Facility
			6 - Date/Time of Message
			7 - Security
			8 - Message Type
			9 - Message Control ID
			10 - Processing ID
			11 - Version ID
			... (don't care about anything past 11)
		*/
		var newMshArr = ["MSH",oldMshArr[1], oldMshArr[4], oldMshArr[5], oldMshArr[2], oldMshArr[3], oldMshArr[6], "", "ACK"+this.compsep+"O01",oldMshArr[9], oldMshArr[10], oldMshArr[11]];
		msh = newMshArr.join(this.fieldsep);
		// add the msa segment
		var msa = "MSA" + this.fieldsep + "AA" + this.fieldsep + oldMshArr[9];

		var ack = msh + "\r" + msa;

		// add startframe and endframe to ack
		ack = startFrame + ack + endFrame;

		return ack;
	};

	// writes the message to a file
	this.WriteToFile = function() {
		console.log("save data: ", this.message);
		var ticks = new Date().getTime();

		var file = Config.baseFolder + ticks;
		while (fs.existsSync(file)) {
			ticks++;
			file = Config.baseFolder + ticks;
		}

		var retries = 5;
		var count = 0;

		var saved = false;

		// try to write it to the file 5 times, just to try and keep from losing it
		while (count < retries) {

			fs.writeFileSync(file, this.message);
			if (!fs.existsSync(file)) {
				// something happened, try to write again
				count++;
			} else {
				saved = true;
				count = 5;
			}
		}

		// we reached here, so it wasn't saved
		return saved;
	};
}

// this is the actual server object that receives messages from the server
var server = net.createServer(function (socket) {
	console.log('CONNECTED: ' + socket.remoteAddress + ':' + socket.remotePort);

	// data event handler
	socket.on('data', function(data) {
		dataString += data;

		// check where the start and end frames of the MLP message are
		var posStart = dataString.indexOf(startFrame);
		var posEnd = dataString.indexOf(endFrame);

		while (posStart > -1 && posEnd > -1) {
			if (posStart > -1 && posEnd > -1) {
				// we seem to have the whole message now
				if (posEnd < posStart) {
					// we missed some of the message, remove everything up to (and including) the endFrame
					dataString = dataString.substring(posEnd + endFrame.length);
				} else {
					// seems to be in order, now we do some work

					// get the message
					var msg = dataString.substring(posStart + posStart.length, posEnd).trim();

					console.log("Message : " + msg);

					MsgHandler.message = msg;

					var saved = MsgHandler.WriteToFile();

					if (saved) {
						console.log("Saved: " + MsgHandler.message);
					} else {
						// we ended up not saving the message, so just tell them
						// it was destroyed
						console.log("Destroyed: " + MsgHandler.message);
					}

					var ack = MsgHandler.buildAck();

					console.log("ACK: ",ack);

					socket.write(ack);

					// remove the message from the datastring
					dataString = dataString.substring(posEnd + endFrame.length);
				}
			}

			posStart = dataString.indexOf(startFrame);
			posEnd = dataString.indexOf(endFrame);
		}
	});
});

server.listen(Config.port, Config.ip, function() {
	console.log("TCP Server is listening on port 8070");
});
