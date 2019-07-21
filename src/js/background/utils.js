import rules from './rules';
import parseDomain from 'parse-domain';
import RouteRecognizer from 'route-recognizer';

window.pageRSS = [];
window.pageRSSHub = [];
window.websiteRSSHub = [];

chrome.browserAction.setBadgeBackgroundColor({
    color: '#FF2800',
});

function setBadge (id) {
    chrome.browserAction.setBadgeText({
        text: ((window.pageRSS.length + window.pageRSSHub.length) || (window.websiteRSSHub.length ? '·' : '')) + '',
        tabId: id,
    });
}

function ruleHandler (rule, params, tabId, done) {
    const run = () => {
        let reaultWithParams;
        if (typeof rule.target === 'function') {
            reaultWithParams = rule.target(params);
        } else if (typeof rule.target === 'string') {
            reaultWithParams = rule.target;
        }
    
        if (reaultWithParams) {
            for (const param in params) {
                reaultWithParams = reaultWithParams.replace(`/:${param}`, `/${params[param]}`);
            }
        }
    
        return reaultWithParams;
    }
    if (rule.script) {
        chrome.tabs.sendMessage(tabId, {
            text: 'executeScript',
            code: rule.script
        }, (result) => {
            params = Object.assign({}, result, params);
            done(run());
        });
    } else {
        done(run());
    }
}

function getPageRSSHub (url, tabId, done) {
    const parsedDomain = parseDomain(url);
    if (parsedDomain) {
        const subdomain = parsedDomain.subdomain;
        const domain = parsedDomain.domain + '.' + parsedDomain.tld;
        if (rules[domain] && rules[domain][subdomain || '.']) {
            const rule = rules[domain][subdomain || '.'];
            const recognized = [];
            rule.forEach((ru, index) => {
                const router = new RouteRecognizer();
                router.add([{
                    path: ru.source,
                    handler: index,
                }]);
                const result = router.recognize(new URL(url).pathname.replace(/\/$/, ''));
                if (result && result[0]) {
                    recognized.push(result[0]);
                }
            });
            const result = [];
            Promise.all(recognized.map((recog) => {
                return new Promise((resolve) => {
                    ruleHandler(rule[recog.handler], recog.params, tabId, (parsed) => {
                        if (parsed) {
                            result.push({
                                title: rule[recog.handler].title,
                                url: 'https://rsshub.app' + parsed,
                            });
                        }
                        resolve();
                    });
                })
            })).then(() => {
                done(result);
            });
        } else {
            done([]);
        }
    } else {
        done([]);
    }
}

function getWebsiteRSSHub (url) {
    const parsedDomain = parseDomain(url);
    if (parsedDomain) {
        const domain = parsedDomain.domain + '.' + parsedDomain.tld;
        if (rules[domain]) {
            const domainRules = [];
            for (const subdomainRules in rules[domain]) {
                domainRules.push(...rules[domain][subdomainRules]);
            }
            return domainRules.map((rule) => ({
                title: rule.title,
                url: rule.description,
            }));
        } else {
            return [];
        }
    } else {
        return [];
    }
}

export function handleRSS (feeds) {
    chrome.tabs.query({
        active: true,
        currentWindow: true,
    }, (tabs) => {
        const currentTab = tabs[0];

        feeds && feeds.forEach((feed) => {
            feed.image = currentTab.favIconUrl || feed.image;
        });
        window.pageRSS = feeds || [];

        getPageRSSHub(currentTab.url, currentTab.id, (feeds) => {
            window.pageRSSHub = feeds || [];
            setBadge(currentTab.id);
        });

        window.websiteRSSHub = getWebsiteRSSHub(currentTab.url) || [];

        setBadge(currentTab.id);
    });
}