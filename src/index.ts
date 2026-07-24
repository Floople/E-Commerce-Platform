import { server as mockExternalApi } from "./externalApi/mockServer";
import { server as internalServer } from "./server";

const EXTERNAL_PORT = Number(process.env.EXTERNAL_PORT ?? 3000);
const INTERNAL_PORT = Number(process.env.PORT ?? 3001);

mockExternalApi.listen(EXTERNAL_PORT, () => {
    console.log(`Mock external API (Customers/Products/Shipments) running at http://localhost:${EXTERNAL_PORT}`);
});

internalServer.listen(INTERNAL_PORT, () => {
    console.log(`Internal e-commerce server running at http://localhost:${INTERNAL_PORT}`);
});
