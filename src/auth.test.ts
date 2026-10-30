import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type AuthFailure,
  authenticateUser,
  createSession,
  deleteSession,
  findUserById,
  hashPassword,
  openAuthDatabase,
  recordMatch,
  registerUser,
  userFromSession,
  validatePassword,
  validateUsername,
  verifyPassword
} from "./auth.ts";

function memoryDb() {
  return openAuthDatabase(":memory:");
}

test("username must be 3–20 letters, numbers, or underscores", () => {
  assert.equal(validateUsername("ada"), "ada");
  assert.equal(validateUsername("  Ada_99  "), "Ada_99");
  assert.equal((validateUsername("ab") as AuthFailure).status, 400);
  assert.equal((validateUsername("a very long username1") as AuthFailure).status, 400);
  assert.equal((validateUsername("bad name") as AuthFailure).status, 400);
});

test("password must be 8–72 characters", () => {
  assert.equal(validatePassword("password"), "password");
  assert.equal((validatePassword("short") as AuthFailure).status, 400);
});

test("hashes and verifies passwords", async () => {
  const stored = await hashPassword("password1");
  assert.equal(await verifyPassword("password1", stored), true);
  assert.equal(await verifyPassword("password2", stored), false);
});

test("registers a user and rejects a duplicate username", async () => {
  const db = memoryDb();
  const created = await registerUser(db, "Ada", "password1");
  assert.equal("id" in created, true);
  if ("id" in created) {
    assert.equal(created.username, "Ada");
    assert.equal(created.wins, 0);
  }

  const duplicate = await registerUser(db, "ada", "password1");
  assert.equal("error" in duplicate, true);
  if ("error" in duplicate) assert.equal(duplicate.status, 409);
  db.close();
});

test("authenticates with the original password, ignoring username case", async () => {
  const db = memoryDb();
  await registerUser(db, "Ada", "password1");
  const user = await authenticateUser(db, "ada", "password1");
  assert.equal("username" in user, true);
  if ("username" in user) assert.equal(user.username, "Ada");

  const wrong = await authenticateUser(db, "Ada", "password2");
  assert.equal("error" in wrong, true);
  db.close();
});

test("sessions look up the user and can be deleted", async () => {
  const db = memoryDb();
  const created = await registerUser(db, "Ada", "password1");
  assert.ok("id" in created);
  if (!("id" in created)) return;

  const token = createSession(db, created.id);
  const fromSession = userFromSession(db, token);
  assert.deepEqual(fromSession, created);

  deleteSession(db, token);
  assert.equal(userFromSession(db, token), null);
  db.close();
});

test("recordMatch increments wins and losses", async () => {
  const db = memoryDb();
  const winner = await registerUser(db, "Ada", "password1");
  const loser = await registerUser(db, "Bob", "password1");
  assert.ok("id" in winner && "id" in loser);
  if (!("id" in winner) || !("id" in loser)) return;

  recordMatch(db, winner.id, loser.id);
  assert.equal(findUserById(db, winner.id)?.wins, 1);
  assert.equal(findUserById(db, loser.id)?.losses, 1);
  db.close();
});
