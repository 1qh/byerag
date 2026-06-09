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
import type * as costRecords from "../costRecords.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as docs from "../docs.js";
import type * as docsEmbed from "../docsEmbed.js";
import type * as docsExtract from "../docsExtract.js";
import type * as docsPolicy from "../docsPolicy.js";
import type * as docsSummary from "../docsSummary.js";
import type * as docsUpload from "../docsUpload.js";
import type * as env from "../env.js";
import type * as fileActions from "../fileActions.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as lib_trainingUrgency from "../lib/trainingUrgency.js";
import type * as lib_userKind from "../lib/userKind.js";
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
import type * as sandboxMaterialize from "../sandboxMaterialize.js";
import type * as sandboxes from "../sandboxes.js";
import type * as secretHash from "../secretHash.js";
import type * as settings from "../settings.js";
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
import type * as tools_docs__provider from "../tools/docs/_provider.js";
import type * as tools_docs_conflict from "../tools/docs/conflict.js";
import type * as tools_docs_diff from "../tools/docs/diff.js";
import type * as tools_docs_grep from "../tools/docs/grep.js";
import type * as tools_docs_list from "../tools/docs/list.js";
import type * as tools_docs_read from "../tools/docs/read.js";
import type * as tools_docs_similar from "../tools/docs/similar.js";
import type * as tools_generated_registry from "../tools/generated/registry.js";
import type * as tools_generated_toolCallers from "../tools/generated/toolCallers.js";
import type * as tools_generated_toolTypes from "../tools/generated/toolTypes.js";
import type * as tools_training__provider from "../tools/training/_provider.js";
import type * as tools_training_attemptDetail from "../tools/training/attemptDetail.js";
import type * as tools_training_attempts from "../tools/training/attempts.js";
import type * as tools_training_status from "../tools/training/status.js";
import type * as tools_training_topics from "../tools/training/topics.js";
import type * as training from "../training.js";
import type * as trainingAssignments from "../trainingAssignments.js";
import type * as trainingAttempts from "../trainingAttempts.js";
import type * as trainingGen from "../trainingGen.js";
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
  costRecords: typeof costRecords;
  crons: typeof crons;
  dashboard: typeof dashboard;
  docs: typeof docs;
  docsEmbed: typeof docsEmbed;
  docsExtract: typeof docsExtract;
  docsPolicy: typeof docsPolicy;
  docsSummary: typeof docsSummary;
  docsUpload: typeof docsUpload;
  env: typeof env;
  fileActions: typeof fileActions;
  files: typeof files;
  http: typeof http;
  lib: typeof lib;
  "lib/trainingUrgency": typeof lib_trainingUrgency;
  "lib/userKind": typeof lib_userKind;
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
  sandboxMaterialize: typeof sandboxMaterialize;
  sandboxes: typeof sandboxes;
  secretHash: typeof secretHash;
  settings: typeof settings;
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
  "tools/docs/_provider": typeof tools_docs__provider;
  "tools/docs/conflict": typeof tools_docs_conflict;
  "tools/docs/diff": typeof tools_docs_diff;
  "tools/docs/grep": typeof tools_docs_grep;
  "tools/docs/list": typeof tools_docs_list;
  "tools/docs/read": typeof tools_docs_read;
  "tools/docs/similar": typeof tools_docs_similar;
  "tools/generated/registry": typeof tools_generated_registry;
  "tools/generated/toolCallers": typeof tools_generated_toolCallers;
  "tools/generated/toolTypes": typeof tools_generated_toolTypes;
  "tools/training/_provider": typeof tools_training__provider;
  "tools/training/attemptDetail": typeof tools_training_attemptDetail;
  "tools/training/attempts": typeof tools_training_attempts;
  "tools/training/status": typeof tools_training_status;
  "tools/training/topics": typeof tools_training_topics;
  training: typeof training;
  trainingAssignments: typeof trainingAssignments;
  trainingAttempts: typeof trainingAttempts;
  trainingGen: typeof trainingGen;
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
