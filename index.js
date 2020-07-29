var eejs = require("ep_etherpad-lite/node/eejs/")
var settings = require("ep_etherpad-lite/node/utils/Settings")
let socketIo = null
var log4js = require("ep_etherpad-lite/node_modules/log4js")
var sessioninfos = require("ep_etherpad-lite/node/handler/PadMessageHandler").sessioninfos
var statsLogger = log4js.getLogger("stats")
var stats = require("ep_etherpad-lite/node/stats")
var packageJson = require('./package.json');
const db = require("./server/dbRepository")
// Make sure any updates to this are reflected in README
var statErrorNames = ["Abort", "Hardware", "NotFound", "NotSupported", "Permission", "SecureConnection", "Unknown"]

let { VIDEO_CHAT_LIMIT } = require("./config")

const videoChat = require("./server/videoChat")
const textChat = require("./server/textChat")


exports.socketio = function (hookName, args, cb) {
	socketIo = args.io
	const io = args.io

	io.of("/heading_chat_room").on("connect", function (socket) {

		socket.on("join pad", function (padId ,userId, callback) {
			socket.ndHolder = {userId, padId}
			socket.join(padId)
			callback(null)
		})

		socket.on("userJoin", (padId, userData, callback) => {

			const {roomInfo, data, canUserJoin} = videoChat.socketUserJoin(userData)

			if(canUserJoin) {
				socket.ndHolder = data
				socket.broadcast.to(padId).emit("userJoin", data, roomInfo)
				callback(data, roomInfo)
			} else {
				callback(null, roomInfo)
			}
		})

		socket.on("userLeave", (padId, userData, callback) => {
			const {data, roomInfo} = videoChat.socketUserLeave(userData)

			if(!data || !roomInfo) return callback(null, null);

			socket.broadcast.to(padId).emit("userLeave", data, roomInfo)
			callback(data, roomInfo)
		})

		socket.on("bulkUpdateRooms", (padId, hTagList, callback) => {
			const {roomCollection, roomInfo} =videoChat.socketBulkUpdateRooms(padId, hTagList)

			if(!roomCollection || !roomInfo) return false

			socket.broadcast.to(padId).emit("bulkUpdateRooms", roomCollection, null)
			callback(roomCollection, roomInfo)
		})

		socket.on('disconnect', () => {
			const userData = socket.ndHolder
			// in the case when pad does not load plugin properly,
			// there is no 'ndHolder'(userData)
			if(!userData) return false;

			const {padId, data, roomInfo} = videoChat.socketDisconnect(userData)
			socket.broadcast.to(padId).emit("userLeave", data, roomInfo)
		})

		socket.on('getTextMessages', (padId, headId, pagination, callback) => {
			// get last message id, then get last newest message, then send to client
			const messages = await textChat.obtainMessages(padId, headId, pagination)
					.catch(error => {
						throw new Error('[socket]: get text messages has an error, ' + error.message)
					})

			callback(messages)
		})

		socket.on("sendTextMessage", async (padId, headId, message, callback) =>  {
				// save text message and get messageId
				// combine message with messageId then past back to user
				// then broad cast to pad
				const messageId = await textChat.save(padId, headId, message)
					.catch(error => {
						throw new Error('[socket]: send text message has an error, ' + error.message)
					})

				socket.broadcast.to(padId).emit("getTextMessage", message)
				callback(message)
		})

	})
}

exports.eejsBlock_mySettings = function (hookName, args, cb) {
	args.content = args.content + eejs.require("ep_wrtc_heading/templates/settings.ejs")
	return cb();
}

exports.eejsBlock_scripts = function (hookName, args, cb) {
	args.content = args.content + eejs.require("ep_wrtc_heading/templates/webrtcComponent.html", {}, module)
	args.content += "<script src='../static/plugins/ep_wrtc_heading/static/js/webrtc.js?v=" + packageJson.version + "'></script>"
	args.content += "<script src='../static/plugins/ep_wrtc_heading/static/js/webrtcRoom.js?v=" + packageJson.version + "'></script>"
	return cb();
}

exports.eejsBlock_styles = function (hookName, args, cb) {
	args.content += '<link rel="stylesheet" href="../static/plugins/ep_wrtc_heading/static/css/rtcbox.css?v=' + packageJson.version + '" type="text/css" />'
	return cb();
}

exports.clientVars = function (hook, context, callback) {
	var enabled = true
	if (settings.ep_wrtc_heading && settings.ep_wrtc_heading.enabled === false) {
		enabled = settings.ep_wrtc_heading.enabled
	}

	var iceServers = [{ url: "stun:stun.l.google.com:19302" }]
	if (settings.ep_wrtc_heading && settings.ep_wrtc_heading.iceServers) {
		iceServers = settings.ep_wrtc_heading.iceServers
	}

	var video = { sizes: {} }
	if (settings.ep_wrtc_heading && settings.ep_wrtc_heading.video && settings.ep_wrtc_heading.video.sizes) {
		video.sizes = {
			large: settings.ep_wrtc_heading.video.sizes.large,
			small: settings.ep_wrtc_heading.video.sizes.small,
		}
	}

	if (settings.ep_wrtc_heading && settings.ep_wrtc_heading.videoChatLimit) {
		VIDEO_CHAT_LIMIT = settings.ep_wrtc_heading.videoChatLimit
	}

	var result = {
		webrtc: {
			version: packageJson.version,
			videoChatLimit: VIDEO_CHAT_LIMIT,
			iceServers: iceServers,
			enabled: enabled,
			video: video,
		},
	}

	return callback(result);
}

exports.handleMessage = function (hook, context, callback) {
	var result = [null]
	if (context.message.type === "COLLABROOM" && context.message.data.type === "RTC_MESSAGE") {
		handleRTCMessage(context.client, context.message.data.payload)
		callback(result)
	} else if (context.message.type === "STATS" && context.message.data.type === "RTC_MESSAGE") {
		handleErrorStatMessage(context.message.data.statName)
		callback(result)
	} else {
		callback()
	}
}

function handleErrorStatMessage (statName) {
	if (statErrorNames.indexOf(statName) !== -1) {
		stats.meter("ep_wrtc_heading_err_" + statName).mark()
	} else {
		statsLogger.warn("Invalid ep_wrtc_heading error stat: " + statName)
	}
}

/**
 * Handles an RTC Message
 * @param client the client that send this message
 * @param message the message from the client
 */
function handleRTCMessage (client, payload) {
	var userId = sessioninfos[client.id].author
	var to = payload.to
	var padId = sessioninfos[client.id].padId
	var room = socketIo.sockets.adapter.rooms[padId]
	var clients = []

	if (room && room.sockets) {
		for (var id in room.sockets) {
			clients.push(socketIo.sockets.sockets[id])
		}
	}

	var msg = {
		type: "COLLABROOM",
		data: {
			type: "RTC_MESSAGE",
			payload: {
				from: userId,
				data: payload.data,
			},
		},
	}
	// Lookup recipient and send message
	for (var i = 0; i < clients.length; i++) {
		var session = sessioninfos[clients[i].id]
		if (session && session.author === to) {
			clients[i].json.send(msg)
			break
		}
	}
}


// ExpressJs 
