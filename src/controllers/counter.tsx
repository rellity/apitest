import { Hono } from "hono";
import { Layout } from "../views/layout";
import { Counter } from "../views/counter";

export const counterController = new Hono()
    .get("/", (c) => c.html(<Layout >
        <Counter />
    </Layout>))