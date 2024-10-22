const net = require("net");
const { profanity, CensorType } = require("@2toad/profanity");
const { channelNames, specialUsers } = require("./data");

const cfg = {
    port: 1337,
    buffer_size: 1024 * 1024, // 1mb max message size
    sendOwnMessagesBack: true 
};

const sockets = {};

const server = net.createServer();

function _log() {
    if (cfg.verbose) console.log.apply(console, arguments);
}

let chatChannels = {
    Global: []
}

let reportedMessages = [];

let servers = [
    {
        name: "Big Lobby",
        staysOpen: true, // Doesn't close when empty
        players: [],
        host: null, // TODO: Setup rotation
        password: null, // The key required to join
        maxPlayers: 100,
        hasPassword: false, // Doesn't require password to join
        id: 0,
        currentSong: {
            songName: "",
            songDiff: ""
        },
        started: false,
        chatMessages: []
    }
];

function cleanUpChatMessage(msg, userid) {
    if (profanity.exists(msg, CensorType.WORD)) {
        // add to reported messages
        reportedMessages.push({content: msg, userid: userid});
    }

    return profanity.censor(msg, CensorType.WORD);
}

process.on("uncaughtException", (err) => {
  _log("Exception: " + err); 
});

server.on("connection", (socket) => {
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 300 * 1000);
    socket.isConnected = true;
    socket.connectionId = socket.remoteAddress + "-" + socket.remotePort;
    socket.buffer = Buffer.alloc(cfg.buffer_size);
    socket.buffer.len = 0; // due to Buffer"s nature we have to keep track of buffer contents ourself

    _log("New client: " + socket.remoteAddress + ":" + socket.remotePort);

    socket.on("data", (dataRaw) => {
        if (dataRaw.length > cfg.buffer_size - socket.buffer.len) {
        _log(
            "Message doesn't fit the buffer. Adjust the buffer size in configuration"
        );
        socket.buffer.len = 0; 
        return false;
        }

        socket.buffer.len += dataRaw.copy(socket.buffer, socket.buffer.len);

        let start;
        let end;
        let str = socket.buffer.slice(0, socket.buffer.len).toString();

        if ((start = str.indexOf("__SUBSCRIBE__")) !== -1 &&
                (end = str.indexOf("__ENDSUBSCRIBE__")) !== -1) {
            if (socket.channel && sockets[socket.channel] && 
                    sockets[socket.channel][socket.connectionId]) {
                delete sockets[socket.channel][socket.connectionId];
            }
            socket.channel = str.substr(start + 13, end - (start + 13));
            socket.write("Hello. Network online. \r\n");
            _log(
                `TCP Client ${socket.connectionId} subscribes for channel: ${socket.channel}`
            );
            str = str.substr(end + 16);
            socket.buffer.len = socket.buffer.write(str, 0);
            sockets[socket.channel] = sockets[socket.channel] || {}; // hashmap of sockets  subscribed to the same channel
            sockets[socket.channel][socket.connectionId] = socket;
        }

        let timeToExit = true;
        do {
            if ((start = str.indexOf("__JSON__START__")) !== -1 &&
                    (end = str.indexOf("__JSON__END__")) !== -1) {

                var json = str.substr(start + 15, end - (start + 15));
                _log(`TCP Client ${socket.connectionId} posts json: ${json}`);
                str = str.substr(end + 13);
                socket.buffer.len = socket.buffer.write(str, 0);

                var obj = JSON.parse(json);

                if (obj.action === "getServers") {
                    json = `{"servers": ${JSON.stringify(servers)}, "action": "gotServers", "user": "${obj.user}"}`;
                }

                const payload = "__JSON__START__" + json + "__JSON__END__";

                const channelSockets = sockets[socket.channel];
                if (channelSockets) {
                const subscribers = Object.values(channelSockets);
                for (let sub of subscribers) {
                    if (!cfg.sendOwnMessagesBack && sub === socket) {
                        continue;
                    }
                    sub.isConnected && sub.write(payload);
                }
                }
                timeToExit = false;
            } else {
                timeToExit = true;
            }
        } while (!timeToExit);
    });

    socket.on("error", () => {
        return _destroySocket(socket);
    });
    socket.on("close", () => {
        return _destroySocket(socket);
    });
});

function _destroySocket(socket) {
    if (!socket.channel || !sockets[socket.channel] || !sockets[socket.channel][socket.connectionId])
        return;
    
    sockets[socket.channel][socket.connectionId].isConnected = false;
    sockets[socket.channel][socket.connectionId].destroy();
    sockets[socket.channel][socket.connectionId].buffer = null;
    delete sockets[socket.channel][socket.connectionId].buffer;
    delete sockets[socket.channel][socket.connectionId];
    _log(`${socket.connectionId} has been disconnected from channel ${socket.channel}`);

    if (Object.keys(sockets[socket.channel]).length === 0) {
        delete sockets[socket.channel];

        _log("empty channel wasted");
    }
}

server.on("listening", () => {
    console.log(
        `Network on ${server.address().address}:${server.address().port}`
    );
});

server.listen(cfg.port, "::");

setInterval(() => {
    console.log("Server running as of " + new Date());
}, 60000);