const Server = require("socket.io").Server;
const createServer = require("http").createServer;
const WebSocket = require("ws");
// Enums
const responseHandlerEnum = require("./providers/utils/XB/response-operations-handlers");
const { disable } = require("express/lib/application");

// Creating the HTTP server
const httpServer = createServer();

// Creating the Socket.IO server
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000" || "https://betting-solutions-nextjs.vercel.app",
  },
});

// OUTSIDE UTILS
const handleOperation = (operationID, extraProperties) => {
  console.log("Operation send to Provider", {
    opt: operationID,
    lng: "en",
    ski: 132,
    ...(extraProperties || {}),
  });
  return JSON.stringify({
    opt: operationID,
    lng: "en",
    ski: 132,
    ...(extraProperties || {}),
  });
};

// Add error event listener for the HTTP server to catch any startup errors
httpServer.on('error', (error) => {
  console.error('Server error:', error);
});

// Handling Socket.IO connections
io.on("connection", (socket) => {
  let isConnectionEstablished = false;
  const requestQueue = [];

  // Function to handle incoming requests
  const handleRequest = (request) => {
    if (isConnectionEstablished) {
      console.log("Handling request");
      const { type } = request;
      if (type === "get-construct") {
        // Assuming 'provider' is defined elsewhere
        provider.send(handleOperation(7));
        provider.send(handleOperation(1));
        provider.send(handleOperation(5));
      } else if (type === 'get-sport') {
        const { sportIDs } = request;
        provider.send(
          handleOperation(2, {
            evti: 0,
            si: 0,
            sil: sportIDs,
            cil: [],
          })
        );
      }
    } else {
      requestQueue.push(request);
    }
  };

  // Function to handle incoming messages
  const handleMessage = (message) => {
    const response = JSON.parse(message.toString());
    const operationID = Number(response.opt);
    console.log("Processing message with ID", operationID);
    const dataParser = responseHandlerEnum[operationID];
    const data = dataParser ? dataParser(response) : message;

    const allowedOperationsIDs = [11, 12, 2];
    if (sportCache === undefined && operationID === 7) {
      sportCache = data;
    } else {
      if (operationID === 1) {
        const filteredSports = responseHandlerEnum.firstConstruct(
          sportCache,
          data
        );
        const firstRequestedSportIDs = Object.values(filteredSports)[0].genderedSportIDs;
        provider.send(
          handleOperation(2, {
            evti: 0,
            si: 0,
            sil: firstRequestedSportIDs,
            cil: [],
          })
        );
        socket.emit("message", { sports: filteredSports, type: ["sports"] });
      }
    }
    if (allowedOperationsIDs.includes(operationID)) {
      if (operationID === 11) {
        socket.emit("message", {
          events: data,
          type: ["events-update"],
        });
      } else if (operationID === 2) {
        templateSubmarket = data.template;
        socket.emit("message", {
          build: data,
          type: ["events-build"],
        });
      } else {
        const data = responseHandlerEnum[12](response, templateSubmarket, true)
        socket.emit("message", { events: data, type: ["odds-update"] });
      }
    }
  };

  // Creating a WebSocket connection to the external provider
  const provider = new WebSocket("wss://betlive.frtpcdn.com/ws");

  // Event listener when the WebSocket connection is open
  provider.on("open", () => {
    isConnectionEstablished = true;

    // Handling queue if any
    if (requestQueue.length > 0) {
      const requestAtHand = requestQueue.shift();
      handleRequest(requestAtHand);
    }

    // Sending all the necessary info for a user
    socket.emit("message", "Provider is open");
  });

  // Event listener for incoming messages from the provider
  provider.on("message", handleMessage);

  // Event listener for incoming messages from the socket
  socket.on("message", handleRequest);

  // Emitting a 'ready' event to the client
  socket.emit("ready");
});

// Start listening on the specified port or the default port 8080
httpServer.listen(process.env.PORT || 8080, () => {
  console.log(`Server is running on port ${process.env.PORT || 8080}`);
});
