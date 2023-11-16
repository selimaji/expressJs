// Peer Dependencies
const Server = require("socket.io").Server;
const createServer = require("http").createServer;
const WebSocket = require("ws");
// Enums
const responseHandlerEnum = require("./providers/utils/XB/response-operations-handlers");
const { disable } = require("express/lib/application");
// Creating the server
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000" ?? "https://betting-solutions-nextjs.vercel.app",
  },
});

// OUTSIDE UTILS
const handleOperation = (operationID, extraProperties) => {
  console.log("Operation send to Provider", {
    opt: operationID,
    lng: "en",
    ski: 132,
    ...(extraProperties ?? {}),
  });
  return JSON.stringify({
    opt: operationID,
    lng: "en",
    ski: 132,
    ...(extraProperties ?? {}),
  });
};

io.on("connection", (socket) => {
  let isConnectionEstablished = false;
  const requestQueue = [];
  // CACHES
  // THIS WILL BE THE SELECTED SPORT CACHE THAT IS USED TO BUILD THE TEMPLATE OF THE EVENTS SUBMARKET
  // <---------------->

  // This is used as the template as we know that operation2 proceeds all other
  // event-related operations, so we know for sure the template will be ready
  let templateSubmarket;
  // THIS IS THE SPORTS CACHE
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
      else if (type === 'get-sport'){
        const {sportIDs} = request
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
  const handleMessage = (message) => {
    const response = JSON.parse(message.toString());
    // handling the operation ID and the resolving
    const operationID = Number(response.opt);
    console.log("Processing message with ID", operationID);
    const dataParser = responseHandlerEnum[operationID];
    const data = dataParser ? dataParser(response) : message;

    //defining allowed IDs to avoid sending duplicated data
    const allowedOperationsIDs = [11, 12, 2];
    if (sportCache === undefined && operationID === 7) {
      sportCache = data;
    } else {
      if (operationID === 1) {
        // this means we have all the necessary information to forward the sport menu
        const filteredSports = responseHandlerEnum.firstConstruct(
          sportCache,
          data
        );
        const firstRequestedSportIDs = Object.values(filteredSports)[0].genderedSportIDs;
        // console.log("Sending Info for request 2 with sport IDs", firstRequestedSportIDs)
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
        // sports construct MUST be defined by now, so we can rerun the sports construct
        // const sportsConstruct = responseHandlerEnum.firstConstruct(
        //   sportCache,
        //   data,
        // );
        // socket.emit("message", {
        //   events: data,
        //   sports: sportsConstruct,
        //   type: ["events-update", "sports"],
        // });
        socket.emit("message", {
          events: data,
          type: ["events-update"],
        });
      } else if (operationID === 2){
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

httpServer.listen(process.env.PORT || 8080, () => {
  console.log("Server is running on port 8000");
});
