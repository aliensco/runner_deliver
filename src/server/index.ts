import "dotenv/config";
import { createApplication } from "./app";

const application = createApplication();
const server = application.app.listen(application.config.port, application.config.host, () => {
  console.log(
    `Runner Deliver API listening on http://${application.config.host}:${application.config.port}`
  );
});

function shutdown(): void {
  server.close(() => {
    application.db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
