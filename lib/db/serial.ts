import type { PoolClient } from "pg";

/**
 * A single Postgres connection can only run one query at a time. Pages load data with Promise.all,
 * so this queues queries on the connection and runs them one after another instead of overlapping.
 */
export function serialize<T extends { query: PoolClient["query"] }>(client: T): T {
  let chain: Promise<unknown> = Promise.resolve();
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "query") {
        return (...args: unknown[]) => {
          const run = chain.then(() => (target.query as (...a: unknown[]) => unknown)(...args));
          chain = run.catch(() => undefined);
          return run;
        };
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}
