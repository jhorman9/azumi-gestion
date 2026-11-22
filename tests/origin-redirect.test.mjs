import assert from "node:assert/strict";
import test from "node:test";
import {
  getSameOriginUrl,
  hasSameOrigin,
} from "../src/lib/security/origin.ts";

test("builds redirects from the public origin instead of the internal URL", () => {
  const request = new Request("https://0.0.0.0:3000/api/auth/login", {
    headers: {
      host: "azumi.example.com",
      origin: "https://azumi.example.com",
    },
  });

  assert.equal(hasSameOrigin(request), true);
  assert.equal(
    getSameOriginUrl(request, "/dashboard").href,
    "https://azumi.example.com/dashboard",
  );
});

test("uses the configured canonical domain for production redirects", () => {
  const request = new Request("https://0.0.0.0:3000/api/auth/login", {
    headers: {
      host: "azumi.example.com",
      origin: "https://azumi.example.com",
    },
  });
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    assert.equal(
      getSameOriginUrl(request, "/dashboard").href,
      "https://admin.azumipty.com/dashboard",
    );
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }
});

test("rejects redirect targets on a different origin", () => {
  const request = new Request("https://azumi.example.com/api/auth/login", {
    headers: {
      host: "azumi.example.com",
      origin: "https://azumi.example.com",
    },
  });

  assert.throws(
    () => getSameOriginUrl(request, "//attacker.example"),
    /must remain on the request origin/,
  );
});
