// Peer Dependencies
const Server = require("socket.io").Server;
const createServer = require("http").createServer;
const WebSocket = require("ws");
// Enums
const responseHandlerEnum = require("../utils/XB/response-operations-handlers");
// Creating the server
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000" ?? "https://betting-solutions-nextjs.vercel.app",
  },
});

io.on("connection", (socket) => {
  let isConnectionEstablished = false;
  const requestQueue = [];
  // caches
  let sportCache;
  // UTILS
  const handleRequest = (request) => {
    if (isConnectionEstablished) {
      console.log("Handling request");
      const { type } = request;
      if (type === "get-construct") {
        provider.send(handleOperation(7));
        provider.send(handleOperation(1));
        provider.send(handleOperation(5));
      }
    } else {
      requestQueue.push(request);
    }
  };
  const handleMessage = (message) => {
    const response = JSON.parse(message.toString());
    // handling the operation ID and the resolving
    const operationID = Number(response.opt);
    console.log("Processing message with ID", operationID);
    const dataParser = responseHandlerEnum[operationID];
    const data = dataParser ? dataParser(response) : message;

    //defining allowed IDs to avoid sending duplicated data
    const allowedOperationsIDs = [11, 12];
    if (sportCache === undefined && operationID === 7) {
      sportCache = data;
    } else {
      if (operationID === 1) {
        // this means we have all the necessary information to forward the sport menu
        const filteredSports = responseHandlerEnum.firstConstruct(
          sportCache,
          data,
        );
        const firstRequestedSportIDs = Object.values(filteredSports).sort(
          ({ genderedSportIDs: a }, { genderedSportIDs: b }) => a[0] - b[0],
        )[0].genderedSportIDs;
        // console.log("Sending Info for request 2 with sport IDs", firstRequestedSportIDs)
        provider.send(
          handleOperation(2, {
            evti: 0,
            si: 0,
            sil: firstRequestedSportIDs,
            cil: [],
          }),
        );
        socket.emit("message", { sports: filteredSports, type: ["sports"] });
      }
    }
    if (allowedOperationsIDs.includes(operationID)) {
      if (operationID === 11) {
        // sports construct MUST be defined by now, so we can rerun the sports construct
        const sportsConstruct = responseHandlerEnum.firstConstruct(
          sportCache,
          data,
        );
        socket.emit("message", {
          events: data,
          sports: sportsConstruct,
          type: ["events-update", "sports"],
        });
      } else socket.emit("message", { events: data, type: ["odds-update"] });
    }
  };

  const provider = new WebSocket("wss://betlive.frtpcdn.com/ws");
  provider.on("open", () => {
    isConnectionEstablished = true;
    // handling queue if any
    if (requestQueue.length > 0) {
      const requestAtHand = requestQueue.shift();
      handleRequest(requestAtHand);
    }
    // sending all the necessary info for a user
    socket.emit("message", "Provider is open");
  });
  provider.on("message", handleMessage);
  socket.on("message", handleRequest);

  socket.emit("ready");
});

httpServer.listen(8000, () => {
  console.log("Server is running on port 8000");
});

// OUTSIDE UTILS
const handleOperation = (operationID, extraProperties) => {
  console.log("Operation send to Provider", {
    opt: operationID,
    lng: "it",
    ski: 132,
    ...(extraProperties ?? {}),
  });
  return JSON.stringify({
    opt: operationID,
    lng: "it",
    ski: 132,
    ...(extraProperties ?? {}),
  });
};
