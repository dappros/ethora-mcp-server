// Room members for the users-access tools: user id, xmppUsername or JID in, xmppUsername out.
import test from "node:test"
import assert from "node:assert/strict"
import { toMemberXmppUsername } from "../dist/routeAuth.js"

const APP = "6ae98216726738507599d791"
const USER = "6afdadf5dd6d40a9c5fde653"

test("a bare user id gets the app prefix", () => {
  assert.equal(toMemberXmppUsername(APP, USER), `${APP}_${USER}`)
})

test("an xmppUsername or a full JID of the app is kept as the xmppUsername", () => {
  assert.equal(toMemberXmppUsername(APP, `${APP}_${USER}`), `${APP}_${USER}`)
  assert.equal(toMemberXmppUsername(APP, `${APP}_${USER}@xmpp.example.com/res`), `${APP}_${USER}`)
})

test("a user of another app or an empty value is refused", () => {
  assert.throws(() => toMemberXmppUsername(APP, `6ae98216726738507599d792_${USER}`), /not a user of app/)
  assert.throws(() => toMemberXmppUsername(APP, "  "), /empty/)
})
