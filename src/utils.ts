import { isNull, isObject, isUndefined, transform } from 'lodash';
import { v7 as uuidv7 } from 'uuid';

const removeUndefinedValues = <T extends object>(obj: T): T =>
	transform(obj, (r, v, k) => {
		if (isUndefined(v) || isNull(v)) return;
		r[k] = isObject(v) ? removeUndefinedValues(v) : v;
	});

/**
 * Extracts various IDs from the provided cookies object.
 *
 * @param cookies - An object containing cookie key-value pairs.
 * @returns An object containing the following IDs:
 * - `organizationId`: The organization ID, if present in the cookies.
 * - `projectId`: The project ID, if present in the cookies.
 * - `userId`: The user ID, if present in the cookies.
 * - `anonymousId`: A UUIDv7 anonymous ID, generated if not present in the cookies.
 * - `sessionId`: A UUIDv7 session ID, generated if not present in the cookies.
 *
 * @remarks
 * For PostHog to recognize the session ID, it must be a UUIDv7. See
 * {@link https://posthog.com/docs/data/sessions#custom-session-ids | PostHog Documentation}
 */
export const  getIdsFromCookies = (cookies: {[key: string]: string}): {
    organizationId: string | undefined,
    projectId: string | undefined,
    userId: string | undefined,
    anonymousId: string,
    sessionId: string,
} => {
    return {
        organizationId: cookies.organizationId,
        projectId: cookies.projectId,
        userId: cookies.userId,
        anonymousId: cookies.anonymousId ?? uuidv7(),
        sessionId: cookies.sessionId ?? uuidv7(),
    }
}

/**
 * Extracts browser information from a user agent string.
 *
 * @param userAgent - The raw user agent string to parse.
 * @returns An object containing the browser name and version, if detected.
 *
 * @example
 * ```typescript
 * const info = getBrowserInfo("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3");
 * console.log(info); // { browser: "Chrome", version: "58" }
 * ```
 */
const getBrowserInfo = (userAgent: string) => {
    let browser:string | undefined;
    let version:string | undefined;

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
 * @param userAgent - The raw user agent string to parse.
 * @returns An object containing the device type, operating system, and OS version.
 * 
 * @example
 * ```typescript
 * const info = getDeviceAndOS("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3");
 * console.log(info);
 * // Output: { deviceType: "Desktop", os: "Windows", osVersion: "10.0" }
 * ```
 */
const getDeviceAndOS = (userAgent: string) => {
    let deviceType:string | undefined;
    let os:string | undefined;
    let osVersion:string | undefined;
    
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
 * @returns {object} An object containing the extracted UTM tags. If `isInitialSession` is true,
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
 * @returns {{ referrer: string | undefined, referringDomain: string | undefined }} 
 * An object containing the original referrer URL and the referring domain.
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
 * @param {Object} params - The parameters for the visit.
 * @param {string} params.userAgent - The user agent string from the visitor's browser.
 * @param {string} params.search - The search query string from the URL.
 * @param {string} params.referrer - The referrer URL.
 * @param {Object} [opts] - Optional parameters.
 * @param {boolean} [opts.isInitialSession] - Indicates if this is the initial session.
 * @returns {Object} An object containing the visit information, including browser, referrer, device, OS, and UTM tags.
 */
export const getVisitInfo = ({userAgent, search, referrer}: {userAgent: string, search: string, referrer: string}, opts?: {isInitialSession: boolean}) => {
    const browserInfo = getBrowserInfo(userAgent);
    const referrerInfo = getReferrerInfo(referrer);
    const deviceInfo = getDeviceAndOS(userAgent);
    const utmTags = getUTMTags(search, opts?.isInitialSession);

    return removeUndefinedValues({
        $raw_user_agent: userAgent,
        $browser: browserInfo.browser,
        $browser_version: browserInfo.version,
        $referrer: referrerInfo.referrer,
        $referring_domain: referrerInfo.referringDomain,
        $device_type: deviceInfo.deviceType,
        $os: deviceInfo.os,
        $os_version: deviceInfo.osVersion,
        ...utmTags,
    });
}