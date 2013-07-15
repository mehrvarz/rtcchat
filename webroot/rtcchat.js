// rtcchat.js
// Copyright 2013 Timur Mehrvarz <timur.mehrvarz@riseup.net>

// wsPort and stunPort values will be patched in by our Go service
var wsPort = {{.SigPort}}    // default=8077
var stunPort = {{.StunPort}} // default=19253

var con = {'optional': [{'DtlsSrtpKeyAgreement': true}, {'RtpDataChannels': true }] };
var socket = null,
	clientId = null,
	clientCount = 0,
	currentRoom = null,
	localOffer = null,
	IAmUser = 0;
var icecfg;
var pc1 = null;
var pc2 = null;
var webrtcDataChannel = null;
var roomName = null;
var serverRoutedMessaging = false;

$('#waitForConnection').modal('hide');

$(function(){
    console.log("start: location.hostname",location.hostname);
    icecfg = {"iceServers":[{"url":"stun:"+location.hostname+":"+stunPort}]};

    var	socketServerAddress;
	if(window.location.href.indexOf("https://")==0)
		socketServerAddress = "wss://"+location.hostname+":"+wsPort+"/ws";
	else
		socketServerAddress = "ws://"+location.hostname+":"+wsPort+"/ws";
    console.log("start: connecting to signaling server",socketServerAddress);
    writeToChatLog("connecting to signaling server "+socketServerAddress, "text-success");
    socket = new WebSocket(socketServerAddress);
	socket.onopen = function () {
	    bindSocketEvents();
	    roomName = getUrlParameter('room');
        if(!roomName) {
        	// roomName was NOT given by URL parameter; getRoomName -> #setRoomBtn
		    console.log("start: no roomName parameter");
		    $('#roomName').focus();
            $('#getRoomName').modal('show');
        } else {
            // roomName was given by URL parameter
            // when the socket-connection is ready, auto-subscribe the room
		    console.log("start: roomName parameter given",roomName);
            $('#waitForConnection').modal('show');
        }
	};
	socket.onerror = function () {
        writeToChatLog("failed to create websocket connection", "text-success");
        alert('failed to create websocket connection '+socketServerAddress);
	}
});

function getUrlParameter(name) {
    name = name.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
    var regexS = "[\\?&]"+name+"=([^&#]*)";
    var regex = new RegExp(regexS);
    var results = regex.exec(window.location.href);
    if(results != null)
        return results[1];
    return "";
}

$('#setRoomBtn').click(function() {
    // user has entered a room name
    roomNameFromForm()
});

function roomNameFromForm() {
    //console.log("roomNameFromForm() ...");
    $('#getRoomName').modal('hide');
    subscribeRoom($('#roomName').val());
}

function subscribeRoom(roomName) {
    // create a signaling room by subscribing the name
    // this is also being called directly from HTML
    console.log("subscribe to roomName", roomName);
    if(socket) {
        // TODO: let server know if serverRoutedMessaging is requested
    	socket.send(JSON.stringify({command:'subscribe', room: roomName}));
        console.log("sent subscription for roomName", roomName,"now wait-for-p2p-connection...");
        $('#waitForConnection').modal('show');
        // wait for the 2nd party to join this room (maybe we are the 2nd party)
        // this will happen in addClient()
    } else {
        console.log("failed to send subscribe request over socket connection");
        writeToChatLog("failed to send subscribe request over socket connection", "text-success");
    }
}

function hideWaitForConnection() {
    $('#waitForConnection').modal('hide');
    $('#waitForConnection').remove();
    $('#showLocalAnswer').modal('hide');
    $('#messageTextBox').focus();
}

function handleRtcConnection() {
    console.log("handleRtcConnection");
    hideWaitForConnection();   
}

function webrtcDisconnect() {
    console.log("webrtcDisconnect...");
    // this can happen while still waiting for a webrtc connection, so we must always hide busybee
    hideWaitForConnection();
    writeToChatLog("p2p session disconnected; hit reload to start new session", "text-success");
    webrtcDataChannel=null;
}

function pc1CreateDataChannel() {
    try {
        console.log("pc1.createDataChannel...");
        // TODO: in chrome: pc1.createDataChannel will fail with dom exception 9
        // and if it doesn't fail, it will respond with an 'empty' sdp answer
        webrtcDataChannel = pc1.createDataChannel('createdbypc1', {reliable:false});
        console.log("pc1.createDataChannel webrtcDataChannel=", webrtcDataChannel,webrtcDataChannel.label);
        if(!webrtcDataChannel) {
            writeToChatLog("pc1.createDataChannel failed", "text-success");
            return;
        }

        //var fileReceiver1 = new FileReceiver();

        webrtcDataChannel.onopen = function () {
            console.log("pc1 webrtcDataChannel.onopen");
            writeToChatLog("established p2p connection", "text-success");   
            // show other ip-addr?

            // greetings: we can start sending p2p data now
            //if(webrtcDataChannel) {
            //	  console.log("pc1 webrtcDataChannel.onopen; send hello from pc1...");
            //	  var msg = "Hello from pc1";
            //	  writeToChatLog(msg, "text-success");
            //	  webrtcDataChannel.send(msg);s
            //} else {
            //    writeToChatLog("failed to send data over webrtcDataChannel", "text-success");
            //}
        };

        webrtcDataChannel.ondisconnect = function() {
            console.log("pc1 webrtcDataChannel.ondisconnect !!!!");
            webrtcDisconnect();
        };
       
        webrtcDataChannel.onclosedconnection = function() {
            console.log("pc1 webrtcDataChannel.onclosedconnection !!!!");
            webrtcDisconnect();
        };

        webrtcDataChannel.onclose = function() {
            console.log("pc1 webrtcDataChannel.onclose !!!!");
            webrtcDisconnect();
        };

        webrtcDataChannel.onerror = function() {
            console.log("pc1 webrtcDataChannel.onerror !!!!");
            writeToChatLog("webrtc error", "text-success");
        };

        webrtcDataChannel.onmessage = function (e) {
            // msgs received by pc1
            console.log("pc1 webrtcDataChannel.onmessage", e.data);
            //if (e.data.size) {
            //    fileReceiver1.receive(e.data, {});
            //}
            //else {
            //    var data = JSON.parse(e.data);
            //    if (data.type === 'file') {
            //        fileReceiver1.receive(e.data, {});
            //    }
            //    else {
            //        writeToChatLog(data.message, "text-info");
            //    }
            //}
            document.getElementById('audiotag').play();
            writeToChatLog(e.data, "text-info");
        };
    } catch (e) { console.warn("pc1.createDataChannel exception", e); }
}

function bindSocketEvents(){
	// bind server socket events for signaling
  	console.log("bindSocketEvents", socket);

    socket.onmessage = function(m) { 
        var data = JSON.parse(m.data);
    	console.log("socket message raw:", data);
    	
    	switch(data.command) {
    		case "connect":
				console.log("connect: socket.send connect");
				// request a clientId
				socket.send(JSON.stringify({command:'connect'}));
				break;

			case "ready":
				clientId = data.clientId;
				console.log("ready: clientId=",clientId);
				// now that we have a signaling client-id, we will create a webrtcDataChannel

				if(roomName) {
				    console.log("ready: subscribe:",roomName);
				    subscribeRoom(roomName);
				}

                if(!serverRoutedMessaging) {
				    console.log("ready: RTCPeerConnection for pc1",icecfg, con);
				    pc1 = new RTCPeerConnection(icecfg, con);  // user 1 = server
				    console.log("ready: set pc1.onconnection");
				    pc1.onconnection = handleRtcConnection;

				    console.log("ready: RTCPeerConnection for pc2",icecfg, con);
				    pc2 = new RTCPeerConnection(icecfg, con);  // user 2 = client
				    console.log("ready: set pc2.onconnection");
				    pc2.onconnection = handleRtcConnection;

				    //if(getUserMedia){
				    //    getUserMedia({'audio':true, fake:true}, function (stream) {
				    //        console.log("Got local audio", stream);
				    //        pc1.addStream(stream);
				    //    }, function (err) { console.warn("getUserMedia error",err); });
				    //} else {
				    //    //alert('Your browser does not support the getUserMedia() API.');
				    //    console.log("Your browser does not support the getUserMedia() API");
				    //    writeToChatLog("Your browser does not support the getUserMedia() API");
				    //} 

				    if (navigator.mozGetUserMedia) {
				        console.log("ready: pc1CreateDataChannel()");
				        pc1CreateDataChannel();
				    } else {
				        console.log("ready: not getting data channel for ",navigator.mozGetUserMedia);
				    }

				    pc2.ondatachannel = function (e) {
				        webrtcDataChannel = e.channel || e; // Chrome sends event, FF sends raw channel
				        console.log("pc2.ondatachannel set webrtcDataChannel",
				        	webrtcDataChannel,webrtcDataChannel.label);
				        if(!webrtcDataChannel) {
				            writeToChatLog("failed to create webrtc dataChannel", "text-success");
				            return;
				        }

				        //var fileReceiver2 = new FileReceiver();

				        webrtcDataChannel.onopen = function () {
				            console.log("pc2 webrtcDataChannel.onopen");
				            // we slightly delay our 'established p2p' msg, so that 
				            // it appears after the 'disconnect from signaling server' msg
						    window.setTimeout(function() {
					            writeToChatLog("established p2p connection", "text-success");
						        // shall we show other client's ip-addr?

						        // greetings: we can now start to send p2p data
						        //if(webrtcDataChannel) {
					            //    console.log("pc2 webrtcDataChannel.onopen; send hello from pc2...");
					            //    var msg = "Hello from pc2";
					            //    writeToChatLog(msg, "text-success");
					            //    webrtcDataChannel.send(msg);
						        //} else {
						        //    writeToChatLog("failed to send data over webrtcDataChannel", "text-success");
						        //}
						    },300);
				        };

				        webrtcDataChannel.ondisconnect = function() {
				            console.log("pc2 webrtcDataChannel.ondisconnect !!!!");
				            webrtcDisconnect();
				        };

				        webrtcDataChannel.onclosedconnection = function() {
				            console.log("pc2 webrtcDataChannel.onclosedconnection !!!!");
				            webrtcDisconnect();
				        };

				        webrtcDataChannel.onclose = function() {
				            console.log("pc2 webrtcDataChannel.onclose");
				            webrtcDisconnect();
				        };

				        webrtcDataChannel.onerror = function() {
				            console.log("pc2 webrtcDataChannel.onerror");
				            writeToChatLog("webrtc error", "text-success");
				        };

				        webrtcDataChannel.onmessage = function (e) {
				            // msgs received by user 2
				            console.log("pc2 webrtcDataChannel.onmessage", e.data);

						    //if (e.data.size) {
						    //    fileReceiver2.receive(e.data, {});
						    //}
						    //else {
						    //    var data = JSON.parse(e.data);
						    //    if (data.type === 'file') {
						    //        fileReceiver2.receive(e.data, {});
						    //    }
						    //    else {
						    //        //writeToChatLog(data.message, "text-info");
						    //        // Scroll chat text area to the bottom on new input.
						    //        //$('#chatlog').scrollTop($('#chatlog')[0].scrollHeight);
						    //    }
						    //}

                            document.getElementById('audiotag').play();
				            writeToChatLog(e.data, "text-info");
				        };
				    };

				    pc2.onaddstream = function (e) {
				        console.log("pc2 got remote stream", e);
				        var el = new Audio();
				        el.autoplay = true;
				        attachMediaStream(el, e.stream);
				    };

				    // pc1.onicecandidate = function (e) {
				    //     console.log("pc1.onicecandidate");
				    //     // This is for Chrome - MOZ has e.candidate alway set to null
				    //     if (!navigator.mozGetUserMedia) {
				    //  	   // TODO chrome?
				    //  	   if (e.candidate) {
				    //             if (e.candidate.candidate) {
				    //                 console.log("ICE candidate (pc1)", JSON.stringify(e.candidate.candidate));
				    //                 pc2.addIceCandidate(e.candidate.candidate);
				    //             } else {
				    //         	       console.log("ICE candidate (pc1) - no candidate");
				    //             }
				    //      
				    //         } else {
				    //             console.log("ICE candidate (pc1) no e.candidate", e);
				    //         }
				    //     }
				    // };

				    if (!navigator.mozGetUserMedia) {
				        pc1.onicecandidate = function (e) {
				            if(e & e.candidate)
				                pc2.addIceCandidate(e.candidate);
				        }
				        pc2.onicecandidate = function (e) {
				            if(e & e.candidate)
				                pc1.addIceCandidate(e.candidate);
				        }
				    }
                }
				break;

			case "roomclients":
				// set the current room
				currentRoom = data.room;
				clientCount=0;
				console.log("roomclients setCurrentRoom",currentRoom," data.clients.length",data.clients.length);
		
				// add the other clients (if any) to the clients list
				for(var i = 0, len = data.clients.length; i < len; i++){
					if(data.clients[i]) {
					    // TODO: find out if other side has requested serverRoutedMessaging
					    // serverRoutedMessaging will be activated, if any one client is requesting it
						addClient(data.clients[i], false);
					}
				}
				// add myself
				if(clientId) {
				    console.log("roomclients addClient",clientId);
					addClient({ clientId: clientId }, true);
				}
				break;
			
			case "presence":
				if(data.state == 'online'){
				    console.log("presence online: other client entered the room",clientCount);
					addClient(data.client, false);
				} else if(data.state == 'offline') {
					if(clientCount>0) {
					    clientCount--;
				        console.log("presence offline: other client left the room, socket.close",clientCount);
				        socket.close();
				        socket = null;
				        writeToChatLog("disconnected from signaling server", "text-success");
					} else {
				        console.log("presence offline - while no clients registered");
					}
				}
				break;

			case "messageForward":
				var message = data.message;
				if(!message) {
				    console.log("messageForward: message is empty - abort");
					return;
				}

				var msgType = data.msgType;
				if(msgType=="message") {
    		        writeToChatLog(message, "text-info");
                    document.getElementById('audiotag').play();
					return;
				}
				if(msgType=="serverconnect") {
    			    console.log("messageForward: serverconnect");
                    hideWaitForConnection();
					return;
				}

				if(IAmUser==2) {
				    // step 1: user 2 is receiving an offer from user 1
				    console.log("user 2 received remote offer", JSON.parse(message));
				    localOffer = null;
				    var offerDesc = new RTCSessionDescription(JSON.parse(message));
				    console.log("user 2 received remote offerDesc", offerDesc);

				    pc2.setRemoteDescription(offerDesc,function () {
				        console.log("user 2 setRemoteDescription offerDesc done; create answer...");
				        pc2.createAnswer(function (answerDesc) {
				            // TODO: chrome failes here with 0.0.0.0
				            console.log("user 2 created local answer", JSON.stringify(answerDesc));
				            localOffer = answerDesc;
				            // PeerConnection won't start gathering candidates until setLocalDescription() called
				            pc2.setLocalDescription(answerDesc, function () {
				                console.log("user 2 setLocalDescription done");
				                // send our answerDesc via signaling server room to user 1
				                if(socket) {
				                    console.log("user 2 send answerDesc to user 1 via selected room...");
				                    // TODO: end-to-end encrypt answerDesc, so only the other party can read it
						    		socket.send(JSON.stringify({
						    			command:'messageForward', 
						    			msgType:'answer', 
						    			message: JSON.stringify(answerDesc)
						    		}));

						            // user 1 will call pc1.setRemoteDescription()                       
				                    // and wait for the p2p connection
				                    console.log("user 2 wait for the p2p connection...");
				                    $('#waitForConnection').modal('show');
				                    // TODO: timeout needed?
				                } else {
				                    console.log("user 2 failed to send data over socket connection");
				                    writeToChatLog("failed to send data over socket connection", "text-success");
				                }
				            }, function () { console.warn("user 2 failed to setLocalDescription"); });
				        }, function () { console.warn("user 2 failed to createAnswer"); });
				    }, function () { console.warn("user 2 failed to setRemoteDescription"); });

					window.setTimeout(function(){
						if(!localOffer) {
						    console.warn("Failed to create answer. A known error. Please restart browser.");
				            alert('Failed to create answer. This is a known error. Please restart browser.');
						}
				    },5000);

				} else if(IAmUser==1) {
				    // step 2: user 1 is receiving an offer back in response from user 2
				    console.log("user 1 received remote answer", message);
				    var answerDesc = new RTCSessionDescription(JSON.parse(message));

				    console.log("user 1 setRemoteDescription answerDesc:", answerDesc);
				    pc1.setRemoteDescription(answerDesc, function () {
				        console.log("user 1 setRemoteDescription answerDesc done");
				        if (navigator.mozGetUserMedia) {   
				        	// FOR MOZ USER AGENT ONLY
				            // NOTE: only user 1 does this
				            console.log("user 1 moz: call connectDataConnection(); wait for rtc-p2p...",pc1,pc2);
				            var port1 = Date.now();
				            var port2 = port1 + 1;
				            pc1.connectDataConnection(port1,port2);
				            pc2.connectDataConnection(port2,port1);

							if(socket) {
								// now is a good time to force disconnect from signaling server
								console.log("messageForward: force socket.close()");
								socket.close();
								socket = null;
								writeToChatLog("disconnected from signaling server", "text-success"); 
							}

				        } else {
				            console.log("user 1 chrome: NOT call connectDataConnection(); wait for rtc-p2p...");
				            // TODO: something missing for chrome?
				        }
				        $('#waitForConnection').modal('show');
				        // waiting for p2p connection (onconnection event to call handleRtcConnection)
				    }, function () { 
				        // - pc1 receives this when talking to chrome/chromium as pc2 
				        //   because chromium sendes an empty sdp answer - or one with 0.0.0.0
				        console.warn("pc1.setRemoteDescription failed"); 
				        webrtcDisconnect();
				    });

				} else {
				    console.log("unknown user received remote offer", message);
				}
		}
    }

    console.log("bindSocketEvents done");
    // if no server is found, we will not receive events 'connect', 'roomclients' and 'ready'
    // let's check if we obtained a clientId within 5 seconds
	window.setTimeout(function(){
	    if(!clientId) {
            writeToChatLog("Failed to retrieve clientId. Server connectivity issue.", "text-success");
            alert("Failed to retrieve clientId. There may be a server connectivity issue.");
            $('#waitForConnection').modal('hide');
	    }
    },5000);
}

// a new client has entered the room
function addClient(client, isMe){
    clientCount++;
	if(isMe){
	    // it's just me who has entered the room
        console.log("addClient isMe wait...",client.clientId,clientCount);
        // we are waiting for onconnect -> handleRtcConnection

	} else {
	    // the other user has arrived in the room
	    if(clientCount==2) {
	        IAmUser=1;
            if(serverRoutedMessaging) {
                console.log("addClient !isMe IAmUser=1 serverRoutedMessaging",client.clientId, clientCount);
                hideWaitForConnection();

                // signal server-routed connect to other user
		    	socket.send(JSON.stringify({
		    		command:'messageForward', 
	    			msgType:'serverconnect', 
		    		message: JSON.stringify("")
		    	}));
                return;
            }

            if (!navigator.mozGetUserMedia) {
                pc1CreateDataChannel();
                console.log("addClient chrome webrtcDataChannel=", webrtcDataChannel);
            }

            if(webrtcDataChannel) {
                console.log("addClient !isMe IAmUser=1 createoffer",client.clientId, clientCount);
                localOffer = null;
                pc1.createOffer(function (offerDesc) {
                    console.log("addClient created local offer", offerDesc);
                    if(offerDesc) {
                        localOffer = offerDesc;
                        // PeerConnection won't start gathering candidates until setLocalDescription() is called
                        console.log("addClient pc1.setLocalDescription");
                        pc1.setLocalDescription(offerDesc, function () {
                            // send offerDesc as signaling server message to user 2
                            if(socket) {
                                console.log("addClient socket.send('messageForward')");
						    	socket.send(JSON.stringify({
						    		command:'messageForward', 
					    			msgType:'offer', 
						    		message: JSON.stringify(offerDesc), 
						    		room:currentRoom  // needed ???
						    	}));

                                // now wait for the response from user 2 via signaling server room
                                // TODO: implement a timeout? can't wait forever for a response to our offer!
                                // we are waiting for answerDesc under if(IAmUser==1)
                            } else {
                                console.log("addClient failed to send messageForward over socket connection')");
                                writeToChatLog("failed to send messageForward over socket connection", 
                                	"text-success");
                            }
                        }, function () { console.warn("pc1.setLocalDescription failed"); });
                    }
                }, function () { console.warn("pc1.createOffer failed"); });

                console.log("Created local offer called");
                // function (offerDesc) may not be called!!!
                // if this happens, this is a firefox 22 bug. firefox needs to be restarted.
                // setTimeout and check if localOffer is set
        		window.setTimeout(function() {
        		    if(!localOffer) {
        		        console.warn("Failed to create offer. This is a known error. Please restart browser.");
        		        alert("Failed to create offer. This is a known error. Please restart browser.");
        		    }
                },5000);
            } else {
            	// webrtcDataChannel was not set by pc1CreateDataChannel()
   		        console.warn("no webrtcDataChannel");
            }

	    } else {
	        IAmUser=2;
            console.log("addClient !isMe IAmUser=2 ",client.clientId,clientCount);
            // we wait for offer from user 1; will arrive via messageForward
	    }
	}
}

function sendMessage(msg) {
    console.log("sendMessage", msg);
    if (msg) {
        $('#messageTextBox').val("");
        writeToChatLog(msg, "text-success");

	    // fileReceiver
    	//var channel = new RTCMultiSession();
        //channel.send({message: msg});

        if(serverRoutedMessaging) {
        	socket.send(JSON.stringify({
        		command:'messageForward', 
			    msgType:'message', 
        		message: JSON.stringify(msg)
        	}));
        } else {
            if(webrtcDataChannel) {
                webrtcDataChannel.send(msg);
            } else {
                writeToChatLog("sendMessage failed no webrtcDataChannel", "text-success");
            }
        }
    }

    return false;
};

function sendMessageFromForm() {
    //console.log("sendMessageFromForm() -> sendMessage()",$('#messageTextBox').val());
    sendMessage($('#messageTextBox').val());
}

$('#sendMessageBtn').click(function() {
    sendMessageFromForm();
});

function getTimestamp() {
    var totalSec = new Date().getTime() / 1000;
    var hours = parseInt(totalSec / 3600) % 24;
    var minutes = parseInt(totalSec / 60) % 60;
    var seconds = parseInt(totalSec % 60);
    return result = (hours < 10 ? "0" + hours : hours) + ":" +
                    (minutes < 10 ? "0" + minutes : minutes) + ":" +
                    (seconds  < 10 ? "0" + seconds : seconds);
}

function writeToChatLog(message, message_type) {
    var msg = message;
    if(message_type!="text-success")
        msg = "other: "+message;
    document.getElementById('chatlog').innerHTML 
    	+= '<p class=\"'+message_type+'\">'+'['+getTimestamp()+'] '+msg+'</p>';
    // Scroll chat text area to the bottom on new input.
    $('#chatlog').scrollTop($('#chatlog')[0].scrollHeight);
}

/*
// fileReceiver
$('#fileBtn').change(function() {
    var file = this.files[0];
    console.log(file);
    sendFile(file);
});

function fileSent(file) {
    console.log(file + " sent");
}

function fileProgress(file) {
    console.log(file + " progress");
}

function sendFile(data) {
    if (data.size) {
	    FileSender.send({
	        file: data,
	        onFileSent: fileSent,
	        onFileProgress: fileProgress,
	    });
    }
}
*/

