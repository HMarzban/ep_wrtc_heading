'use strict';
var share = require("ep_wrtc_heading/static/js/clientShare");

var textChat = (function () {
	var socket = null;
	var padId = null;
	var currentRoom = {};
	var $joinBtn = null;

	function createAndAppendMessage(msg) {
		if (!msg) return true;

		//correct the time
		// msg.time += window.clientTimeOffset;

		var minutes = '' + new Date(msg.time).getMinutes();
		var hours = '' + new Date(msg.time).getHours();
		if (minutes.length === 1) minutes = '0' + minutes;
		if (hours.length === 1) hours = '0' + hours;
		var timeStr = hours + ':' + minutes;

		var userName = $('<b>').text(msg.userName + ": ");
		var tim = $("<span>").attr({ "class": "time" }).text(timeStr);

		var message = $("<p>").attr({
			"data-authorid": msg.author
		}).append(userName).append(tim).append(msg.text);

		$("#wrtc_textChat").append(message);
		share.scrollDownToLastChatText("#wrtc_textChat");
	}

	function eventTextChatInput(e) {
		var keycode = event.keyCode || event.which;
		// when press Enter key
		if (keycode === 13) {
			var textMessage = $(this).val();
			if (!textMessage) return true;
			$(this).val('');
			var user = share.getUserFromId(clientVars.userId);
			var msg = { text: textMessage, userName: user.name, author: user.userId, time: new Date().getTime() };

			socket.emit("sendTextMessage", padId, currentRoom.headerId, msg, function (msg) {
				createAndAppendMessage(msg);
			});
		}
	}

	function eventListers() {
		$(document).on("keypress", "#wrtc_textChatInputBox input", eventTextChatInput);

		$(document).on('click', '#wrtc_textChatWrapper .btn_toggle_modal', function () {

			var action = $(this).attr('data-action');
			var chatBox = $('#wrtc_textChat').innerHeight() + $('#wrtc_textChatInputBox').innerHeight() + 1;

			$(this).find('.fa_arrow-from-top').toggle();
			$(this).find('.fa_arrow-to-top').toggle();

			if (action === 'collapse') {
				$(this).attr({ 'data-action': "expand" });
				$('#wrtc_textChatWrapper').css({
					'transform': 'translate(-50%, ' + chatBox + 'px)'
				});
			} else {
				$(this).attr({ 'data-action': "collapse" });
				$('#wrtc_textChatWrapper').css({
					'transform': 'translate(-50%, 0)'
				});
			}
		});
	}

	function deactivateModal(headerId, roomInfo) {
		var $TextChatWrapper = $(document).find("#wrtc_textChatWrapper");

		$TextChatWrapper.removeClass('active').removeAttr('style');
		$TextChatWrapper.find("#wrtc_textChat p").remove();
		socket.removeListener('receiveTextMessage:' + headerId);

		var $btn = $(document).find("#wrtc_textChatWrapper .btn_toggle_modal");
		$btn.attr({ 'data-action': "collapse" });
		$btn.find('.fa_arrow-from-top').toggle();
		$btn.find('.fa_arrow-to-top').toggle();

	}

	function activateModal(headerId, headTitle, userCount, roomInfo) {
		if (!headerId) return false;
		var existTextChat = $(document).find("#wrtc_textChatWrapper");

		if (!existTextChat.length) {
			var textChatBox = $('#wrtc_textChatBox').tmpl({
				headerId: headerId,
				headTitle: headTitle
			});
			$('body').append(textChatBox);
		} else {
			// TODO: change this to template
			existTextChat.attr({ "data-id": headerId }).find(".btn_leave").attr({ "data-id": headerId });
			existTextChat.find(".nd_title b").text(headTitle);
		}

		// for animation pop up
		setTimeout(function () {
			$(document).find("#wrtc_textChatWrapper").addClass("active");
		}, 250);

		socket.on("receiveTextMessage:" + headerId, function (headingId, msg) {
			if (headingId === headerId) {
				createAndAppendMessage(msg);
			}
		});

		socket.emit("getTextMessages", padId, headerId, {}, function (data) {
			data.forEach(function (el) {
				createAndAppendMessage(el);
			});
		});

		share.appendUserList(roomInfo, "#wrtc_textChatWrapper  #textChatUserModal ul");
	}

	function addUserToRoom(data, roomInfo) {
		if (!data) return true;
		var headerId = data.headerId;
		var $headingRoom = share.$body_ace_outer().find('#' + headerId);
		var headTitle = $headingRoom.find('.wrtc_header b.titleRoom').text();
		var userCount = roomInfo.present;
		$headingRoom.find('.textChatCount').text(userCount);

		share.appendUserList(roomInfo, $headingRoom.find('.wrtc_content.textChat ul'));
		share.appendUserList(roomInfo, "#wrtc_textChatWrapper  #textChatUserModal ul");

		var user = share.getUserFromId(data.userId);

		// notify, a user join the video-chat room
		var msg = {
			'time': new Date(),
			'userId': user.userId,
			'userName': user.name,
			'headerId': data.headerId,
			'userCount': userCount,
			'headerTitle': headTitle
		};

		share.notifyNewUserJoined("text", msg);

		if (data.headerId === currentRoom.headerId && data.userId !== clientVars.userId) {
			$.gritter.add({
				'text': '<span class="author-name">' + user.name + '</span>' + 'has joined the text-chat, <b><i> "' + headTitle + '"</b></i>',
				'sticky': false,
				'time': 3000,
				'position': 'center',
				'class_name': 'chat-gritter-msg'
			});
		}

		if (data.userId === clientVars.userId) {
			currentRoom = data;
			$headingRoom.attr({ 'data-text': true });
			share.roomBoxIconActive();
			activateModal(headerId, headTitle, userCount, roomInfo);
		}

		share.wrtcPubsub.emit("update store", data, headerId, 'JOIN', 'TEXT', roomInfo, function(data) {})

		share.wrtcPubsub.emit("enable room buttons", headerId, 'JOIN', $joinBtn)
	}

	function removeUserFromRoom(data, roomInfo, target, cb) {
		if (!data) return true;
		var headerId = data.headerId;
		var $headingRoom = share.$body_ace_outer().find('#' + headerId);

		var userCount = roomInfo.present;
		$headingRoom.find('.textChatCount').text(userCount);

		var $textChatUserList = $headingRoom.find('.wrtc_content.textChat ul');

		share.appendUserList(roomInfo, $textChatUserList);
		share.appendUserList(roomInfo, "#wrtc_textChatWrapper #textChatUserModal ul");


		if (userCount === 0) {
			$textChatUserList.append('<li class="empty">Be the first to join the <button class="btn_joinChat_text" data-action="JOIN" data-id="' + headerId + '" data-join="TEXT"><b>text-chat</b></button></li>');
		}

		// remove the text-chat notification
		$(".wrtc_text[data-target='text'][data-authorid='" + data.userId + "'][data-id='" + headerId + "']").remove();

		if (data.userId === clientVars.userId) {
			$headingRoom.removeAttr('data-text');
			share.roomBoxIconActive();
			currentRoom = {};
			deactivateModal(data.headerId, roomInfo);
		}

		share.wrtcPubsub.emit("update store", data, headerId, 'LEAVE', 'TEXT', roomInfo, function(data) {
		})

		share.wrtcPubsub.emit("enable room buttons", headerId, 'LEAVE', $joinBtn)

		if (cb && typeof cb === 'function') cb();
	}

	function userJoin(headerId, userData, $joinButton) {
		$joinBtn = $joinButton;

		// check if user already in that room
		if (currentRoom && currentRoom.headerId === headerId) {
			share.wrtcPubsub.emit("enable room buttons", headerId, 'JOIN', $joinBtn)
			return false;
		}

		share.$body_ace_outer().find('button.btn_joinChat_chatRoom').removeClass('active');

		if (!currentRoom.userId) {
			socket.emit('userJoin', padId, userData, "text", addUserToRoom);
		} else {
			socket.emit('userLeave', padId, currentRoom, "text", function (data, roomInfo, target) {
				removeUserFromRoom(data, roomInfo, "text", function () {
					socket.emit('userJoin', padId, userData, "text", addUserToRoom);
				});
			});
		}
	}

	function userLeave(headerId, userData, $joinButton) {
		$joinBtn = $joinButton;
		socket.emit('userLeave', padId, userData, "text", removeUserFromRoom);
	}

	function socketBulkUpdateRooms(rooms, info, target) {
		var roomsInfo = {};
		// create a roomInfo for each individual room
		Object.keys(rooms).forEach(function (headerId) {
			var roomInfo = {
				'present': rooms[headerId].length,
				'list': rooms[headerId]
			};
			roomsInfo[headerId] = roomInfo;
		});

		// bind roomInfo and send user to gateway_userJoin
		Object.keys(rooms).forEach(function (headerId) {
			rooms[headerId].forEach(function (user) {
				textChat.addUserToRoom(user, roomsInfo[headerId], 'text');
			});
		});
	}

	function bulkUpdateRooms(hTagList) {
		socket.emit('bulkUpdateRooms', padId, hTagList, 'text', socketBulkUpdateRooms);
	}

	function postAceInit(hook, context, webSocket, docId) {
		socket = webSocket;
		padId = docId || window.pad.getPadId();
		eventListers();
	}

	return {
		postAceInit: postAceInit,
		activateModal: activateModal,
		deactivateModal: deactivateModal,
		userJoin: userJoin,
		userLeave: userLeave,
		removeUserFromRoom: removeUserFromRoom,
		addUserToRoom: addUserToRoom,
		bulkUpdateRooms: bulkUpdateRooms
	};
})();

module.exports = textChat;