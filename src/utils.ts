import { isNull, isObject, isUndefined, transform } from 'lodash';
import { v7 as uuidv7 } from 'uuid';

const removeUndefinedValues = <T extends object>(obj: T): T =>
	transform(obj, (r, v, k) => {
		if (isUndefined(v) || isNull(v)) return;
		r[k] = isObject(v) ? removeUndefinedValues(v) : v;
	});

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

const getDeviceAndOS = (userAgent: string) => {
    let deviceType:string | undefined;
    let os:string | undefined;
    // Device type detection
    if (/mobile/i.test(userAgent)) {
        deviceType = "Mobile";
    } else if (/tablet/i.test(userAgent)) {
        deviceType = "Tablet";
    } else {
        deviceType = "Desktop";
    }

    // OS detection
    if (userAgent.includes("Win")) {
        os = "Windows";
    } else if (userAgent.includes("Mac")) {
        os = "MacOS";
    } else if (userAgent.includes("Linux")) {
        os = "Linux";
    } else if (userAgent.includes("Android")) {
        os = "Android";
    } else if (userAgent.includes("iOS") || userAgent.includes("iPhone") || userAgent.includes("iPad")) {
        os = "iOS";
    }

    return { deviceType, os };
}

const getUTMTags = (search: string) => {
    const urlParams = new URLSearchParams(search);
    const utmTags = {
        utm_source: urlParams.get('utm_source'),
        utm_medium: urlParams.get('utm_medium'),
        utm_campaign: urlParams.get('utm_campaign'),
        utm_term: urlParams.get('utm_term'),
        utm_content: urlParams.get('utm_content'),
    };
    return utmTags;
}

const getReferrerInfo = (referrer: string) => {
    const referringDomain = referrer ? new URL(referrer).hostname : undefined;
    return { referrer: !!referrer ? referrer : undefined, referringDomain };
}

export const getVisitInfo = ({userAgent, search, referrer}: {userAgent: string, search: string, referrer: string}) => {
    const browserInfo = getBrowserInfo(userAgent);
    const referrerInfo = getReferrerInfo(referrer);
    const deviceInfo = getDeviceAndOS(userAgent);
    const utmTags = getUTMTags(search);

    return removeUndefinedValues({
        $browser: browserInfo.browser,
        $browser_version: browserInfo.version,
        $referrer: referrerInfo.referrer,
        $referring_domain: referrerInfo.referringDomain,
        $device_type: deviceInfo.deviceType,
        $os: deviceInfo.os,
        ...utmTags,
    });
}