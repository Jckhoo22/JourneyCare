/**
 * What Settings shows under About. [SET2]
 *
 * Hand-maintained rather than read from package.json: Vite would have to
 * inline it at build time through `define`, which puts a build-config
 * dependency in the way of a string nobody reads more than once. Bump it when
 * a phase ships.
 */
export const APP_VERSION = "2.0.1";
