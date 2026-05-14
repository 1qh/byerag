/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */
import type * as agent from "../agent.js";
import type * as agentScript from "../agentScript.js";
import type * as apps__apps from "../apps/_apps.js";
import type * as apps_manifest from "../apps/manifest.js";
import type * as apps_types from "../apps/types.js";
import type * as auth from "../auth.js";
import type * as authHelpers from "../authHelpers.js";
import type * as chatRuntime from "../chatRuntime.js";
import type * as chats from "../chats.js";
import type * as cliScript from "../cliScript.js";
import type * as constants from "../constants.js";
import type * as docs from "../docs.js";
import type * as docsExtract from "../docsExtract.js";
import type * as docsUpload from "../docsUpload.js";
import type * as env from "../env.js";
import type * as fileActions from "../fileActions.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as messages from "../messages.js";
import type * as messages_httpHelpers from "../messages/httpHelpers.js";
import type * as messages_proxyHelpers from "../messages/proxyHelpers.js";
import type * as messages_sendCore from "../messages/sendCore.js";
import type * as messages_streamHelpers from "../messages/streamHelpers.js";
import type * as ownerSpend from "../ownerSpend.js";
import type * as redactor from "../redactor.js";
import type * as sandboxClient from "../sandboxClient.js";
import type * as sandboxKill from "../sandboxKill.js";
import type * as sandboxLaunch from "../sandboxLaunch.js";
import type * as sandboxes from "../sandboxes.js";
import type * as secretHash from "../secretHash.js";
import type * as storage from "../storage.js";
import type * as streamProtocol from "../streamProtocol.js";
import type * as testing from "../testing.js";
import type * as testingNode from "../testingNode.js";
import type * as tools__api from "../tools/_api.js";
import type * as tools__app_auth from "../tools/_app/auth.js";
import type * as tools__app_cache from "../tools/_app/cache.js";
import type * as tools__app_cliAuth from "../tools/_app/cliAuth.js";
import type * as tools__app_dispatch from "../tools/_app/dispatch.js";
import type * as tools__app_mentionResolver from "../tools/_app/mentionResolver.js";
import type * as tools__app_skill from "../tools/_app/skill.js";
import type * as tools__app_stream from "../tools/_app/stream.js";
import type * as tools_generated_registry from "../tools/generated/registry.js";
import type * as tools_generated_toolCallers from "../tools/generated/toolCallers.js";
import type * as tools_generated_toolTypes from "../tools/generated/toolTypes.js";
import type * as userContexts from "../userContexts.js";
import type * as utils from "../utils.js";
import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  agentScript: typeof agentScript;
  "apps/_apps": typeof apps__apps;
  "apps/manifest": typeof apps_manifest;
  "apps/types": typeof apps_types;
  auth: typeof auth;
  authHelpers: typeof authHelpers;
  chatRuntime: typeof chatRuntime;
  chats: typeof chats;
  cliScript: typeof cliScript;
  constants: typeof constants;
  docs: typeof docs;
  docsExtract: typeof docsExtract;
  docsUpload: typeof docsUpload;
  env: typeof env;
  fileActions: typeof fileActions;
  files: typeof files;
  http: typeof http;
  lib: typeof lib;
  messages: typeof messages;
  "messages/httpHelpers": typeof messages_httpHelpers;
  "messages/proxyHelpers": typeof messages_proxyHelpers;
  "messages/sendCore": typeof messages_sendCore;
  "messages/streamHelpers": typeof messages_streamHelpers;
  ownerSpend: typeof ownerSpend;
  redactor: typeof redactor;
  sandboxClient: typeof sandboxClient;
  sandboxKill: typeof sandboxKill;
  sandboxLaunch: typeof sandboxLaunch;
  sandboxes: typeof sandboxes;
  secretHash: typeof secretHash;
  storage: typeof storage;
  streamProtocol: typeof streamProtocol;
  testing: typeof testing;
  testingNode: typeof testingNode;
  "tools/_api": typeof tools__api;
  "tools/_app/auth": typeof tools__app_auth;
  "tools/_app/cache": typeof tools__app_cache;
  "tools/_app/cliAuth": typeof tools__app_cliAuth;
  "tools/_app/dispatch": typeof tools__app_dispatch;
  "tools/_app/mentionResolver": typeof tools__app_mentionResolver;
  "tools/_app/skill": typeof tools__app_skill;
  "tools/_app/stream": typeof tools__app_stream;
  "tools/generated/registry": typeof tools_generated_registry;
  "tools/generated/toolCallers": typeof tools_generated_toolCallers;
  "tools/generated/toolTypes": typeof tools_generated_toolTypes;
  userContexts: typeof userContexts;
  utils: typeof utils;
}>;
/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
export declare const components: {};
