import { implement } from "awesomerpc";
import { clientContract, serverContract } from "../contracts.js";

export const clientImpl = implement(clientContract, serverContract)
    .method('refresh', () => {
        window.location.reload();
    })
    .finish();
