import { createServer } from "node:http";
import { getServerPort, handleNetatmoRequest } from "./netatmoServer.js";

const server = createServer(handleNetatmoRequest);
const port = getServerPort();

server.listen(port, () => {
  console.log(`HeatLab Netatmo API running at http://localhost:${port}`);
});
