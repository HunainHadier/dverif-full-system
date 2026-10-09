/**
 * Public surface of the service layer.
 *
 * This file is a BARREL and nothing else. Every consumer imports from
 * "@/services", so keeping the re-exports here means splitting the old
 * single-file layer changed no import site anywhere in the app.
 *
 * Do NOT move logic back into this file. Anything added here re-couples modules
 * that were deliberately separated and re-introduces the one large file this
 * split exists to remove.
 */

export * from "./core";
export * from "./auth";
export * from "./verification";
export * from "./billing";
export * from "./admin";
export * from "./org";
export * from "./hr";
export * from "./misc";
export * from "./support";
export * from "./assets";
export * from "./offboarding";
export * from "./expenses";
export * from "./recruitment";
