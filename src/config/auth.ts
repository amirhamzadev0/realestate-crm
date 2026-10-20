/**
 * Sign-in is off unless AUTH_ENABLED=true. While off, everyone is treated as the Super Admin, the four
 * portals open straight from the home page and no password is asked. Switch it on before real use.
 */
export const authEnabled = process.env.AUTH_ENABLED === "true";
