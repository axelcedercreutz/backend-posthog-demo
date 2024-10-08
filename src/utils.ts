import { isNull, isObject, isUndefined, transform } from 'lodash';
import { v7 as uuidv7 } from 'uuid';

/**
 * Removes undefined and null values from an object.
 *
 * @template T - The type of the object.
 * @param {T} obj - The object to remove undefined and null values from.
 * @returns {T} A new object with undefined and null values removed.
 */
const removeUndefinedValues = <T extends object>(obj: T): T => transform(obj, (r, v, k) => {
    if (isUndefined(v) || isNull(v)) return;
    r[k] = isObject(v) ? removeUndefinedValues(v) : v;
});

/**
 * Extracts various IDs from the provided cookies object.
 *
 * @param {Object.<string, string>} cookies - An object containing cookie key-value pairs.
 * @returns {Object} An object containing the following IDs:
 * - `organization_slug`: The organization ID, if present in the cookies.
 * - `project_ref`: The project ID, if present in the cookies.
 * - `user_id`: The user ID, if present in the cookies.
 * - `anonymous_id`: A UUIDv7 anonymous ID, generated if not present in the cookies.
 * - `session_id`: A UUIDv7 session ID, generated if not present in the cookies.
 *
 * @remarks
 * For PostHog to recognize the session ID, it must be a UUIDv7. See
 * {@link https://posthog.com/docs/data/sessions#custom-session-ids | PostHog Documentation}
 */
export const getIdsFromCookies = (cookies: { [key: string]: string }): {
    organization_slug: string | undefined,
    project_ref: string | undefined,
    user_id: string | undefined,
    anonymous_id: string,
    session_id: string,
} => {
    return {
        organization_slug: cookies.organization_id,
        project_ref: cookies.project_id,
        user_id: cookies.user_id,
        anonymous_id: cookies.anonymous_id ?? uuidv7(),
        session_id: cookies.session_id ?? uuidv7(),
    }
}

/**
 * Extracts browser information from a user agent string.
 *
 * @param {string} userAgent - The raw user agent string to parse.
 * @returns {Object} An object containing the browser name and version, if detected.
 *
 * @example
 * ```typescript
 * const info = getBrowserInfo("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3");
 * console.log(info); // { browser: "Chrome", version: "58" }
 * ```
 */
const getBrowserInfo = (userAgent: string) => {
    let browser: string | undefined;
    let version: string | undefined;
    if (userAgent.includes("Chrome")) {
        browser = "Chrome";
        version = userAgent.match(/Chrome\/(\d+)/)?.[1];
    } else if (userAgent.includes("Firefox")) {
        browser = "Firefox";
        version = userAgent.match(/Firefox\/(\d+)/)?.[1];
    } else if (userAgent.includes("Safari")) {
        if (!userAgent.includes("Chrome")) {
            browser = "Safari";
            version = userAgent.match(/Version\/(\d+)/)?.[1];
        }
    } else if (userAgent.includes("Edge")) {
        browser = "Edge";
        version = userAgent.match(/Edge\/(\d+)/)?.[1];
    } else if (userAgent.includes("MSIE") || userAgent.includes("Trident")) {
        browser = "Internet Explorer";
        version = userAgent.match(/(?:MSIE |rv:)(\d+)/)?.[1];
    }

    return { browser, version };
}

/**
 * Extracts device type, operating system, and OS version from a user agent string.
 *
 * @param {string} userAgent - The raw user agent string to parse.
 * @returns {Object} An object containing the device type, operating system, and OS version.
 * 
 * @example
 * ```typescript
 * const info = getDeviceAndOS("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3");
 * console.log(info);
 * // Output: { deviceType: "Desktop", os: "Windows", osVersion: "10.0" }
 * ```
 */
const getDeviceAndOS = (userAgent: string) => {
    let deviceType: string | undefined;
    let os: string | undefined;
    let osVersion: string | undefined;

    if (/mobile/i.test(userAgent)) {
        deviceType = "Mobile";
    } else if (/tablet/i.test(userAgent)) {
        deviceType = "Tablet";
    } else {
        deviceType = "Desktop";
    }

    if (userAgent.includes("Win")) {
        os = "Windows";
        osVersion = userAgent.match(/Windows NT (\d+\.\d+)/)?.[1];
    } else if (userAgent.includes("Mac")) {
        os = "MacOS";
        osVersion = userAgent.match(/Mac OS X (\d+_\d+)/)?.[1];
    } else if (userAgent.includes("Linux")) {
        os = "Linux";
    } else if (userAgent.includes("Android")) {
        os = "Android";
        os = userAgent.match(/Android (\d+\.\d+)/)?.[1];
    } else if (userAgent.includes("iOS") || userAgent.includes("iPhone") || userAgent.includes("iPad")) {
        os = "iOS";
        os = userAgent.match(/OS (\d+_\d+)/)?.[1];
    }

    return { deviceType, os, osVersion };
}

/**
 * Extracts UTM tags from a URL search string.
 *
 * @param {string} search - The URL search string containing UTM parameters.
 * @param {boolean} [isInitialSession] - Optional flag indicating if this is the initial session.
 * @returns {Object} An object containing the extracted UTM tags. If `isInitialSession` is true,
 *                   additional initial UTM tags are included with default values set to 'organic'.
 *
 * @example
 * // Example usage:
 * const search = '?utm_source=google&utm_medium=cpc&utm_campaign=spring_sale';
 * const utmTags = getUTMTags(search);
 * // utmTags will be:
 * // {
 * //   utm_source: 'google',
 * //   utm_medium: 'cpc',
 * //   utm_campaign: 'spring_sale',
 * //   utm_term: null,
 * //   utm_content: null
 * // }
 *
 * @example
 * // Example usage with initial session:
 * const search = '?utm_source=google&utm_medium=cpc&utm_campaign=spring_sale';
 * const utmTags = getUTMTags(search, true);
 * // utmTags will be:
 * // {
 * //   utm_source: 'google',
 * //   utm_medium: 'cpc',
 * //   utm_campaign: 'spring_sale',
 * //   utm_term: null,
 * //   utm_content: null,
 * //   $initial_utm_source: 'google',
 * //   $initial_utm_medium: 'cpc',
 * //   $initial_utm_campaign: 'spring_sale',
 * //   $initial_utm_term: null,
 * //   $initial_utm_content: null
 * // }
 */
const getUTMTags = (search: string, isInitialSession?: boolean) => {
    const urlParams = new URLSearchParams(search);
    const utmTags = {
        utm_source: urlParams.get('utm_source'),
        utm_medium: urlParams.get('utm_medium'),
        utm_campaign: urlParams.get('utm_campaign'),
        utm_term: urlParams.get('utm_term'),
        utm_content: urlParams.get('utm_content'),
        ...(!!isInitialSession && {
            $initial_utm_source: urlParams.get('utm_source') ?? 'organic',
            $initial_utm_medium: urlParams.get('utm_medium') ?? 'organic',
            $initial_utm_campaign: urlParams.get('utm_campaign') ?? 'organic',
            $initial_utm_term: urlParams.get('utm_term'),
            $initial_utm_content: urlParams.get('utm_content'),
        })
    };
    return utmTags;
}

/**
 * Extracts referrer information from a given URL string.
 *
 * @param {string} referrer - The URL string of the referrer.
 * @returns {Object} An object containing the original referrer URL and the referring domain.
 * - `referrer`: The original referrer URL if provided, otherwise `undefined`.
 * - `referringDomain`: The hostname of the referrer URL if provided, otherwise `undefined`.
 */
const getReferrerInfo = (referrer: string) => {
    const referringDomain = referrer ? new URL(referrer).hostname : undefined;
    return { referrer: !!referrer ? referrer : undefined, referringDomain };
}

/**
 * Retrieves visit information based on user agent, search parameters, and referrer.
 *
 * @param {Object} ph - The parameters for the visit.
 * @param {string} ph.user_agent - The user agent string from the visitor's browser.
 * @param {string} ph.search - The search query string from the URL.
 * @param {string} ph.referrer - The referrer URL.
 * @param {string} ph.language - The language setting of the visitor's browser.
 * @param {number} ph.viewport_height - The height of the visitor's viewport.
 * @param {number} ph.viewport_width - The width of the visitor's viewport.
 * @param {Object} [opts] - Optional parameters.
 * @param {boolean} [opts.isInitialSession] - Indicates if this is the initial session.
 * @returns {Object} An object containing the visit information, including browser, referrer, device, OS, and UTM tags.
 */
export const getVisitInfo = (ph: { user_agent: string, search: string, referrer: string, language: string, viewport_height: number, viewport_width: number }, opts?: { isInitialSession: boolean }) => {
    const { user_agent, search, referrer } = ph;
    const browserInfo = getBrowserInfo(user_agent);
    const referrerInfo = getReferrerInfo(referrer);
    const deviceInfo = getDeviceAndOS(user_agent);
    const utmTags = getUTMTags(search, opts?.isInitialSession);

    return removeUndefinedValues({
        $raw_user_agent: user_agent,
        $browser: browserInfo.browser,
        $browser_version: browserInfo.version,
        $referrer: referrerInfo.referrer,
        $referring_domain: referrerInfo.referringDomain,
        $device_type: deviceInfo.deviceType,
        $os: deviceInfo.os,
        $os_version: deviceInfo.osVersion,
        $locale: ph.language,
        $viewport_height: ph.viewport_height,
        $viewport_width: ph.viewport_width,
        ...utmTags,
    });
}