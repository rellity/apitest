// node_modules/htmx.org/dist/htmx.esm.js
var htmx2 = (() => {
  const HCON = {
    parse(string) {
      if (!string)
        return {};
      if (string.startsWith("{"))
        return JSON.parse(string);
      let pattern = /(?:"([^"]+)"|'([^']+)'|([^\s,:]+))(?:\s*:\s*(?:"([^"]*)"|'([^']*)'|<((?:[^/]|\/(?!>))+)\/>|([^\s,]+)))?(?=\s|,|$)/g;
      let result = {};
      for (let match of string.matchAll(pattern)) {
        let [
          ,
          doubleQuotedKey,
          singleQuotedKey,
          bareKey,
          doubleQuotedValue,
          singleQuotedValue,
          hyperscriptValue,
          bareValue
        ] = match;
        let key = doubleQuotedKey ?? singleQuotedKey ?? bareKey;
        let value = (doubleQuotedValue ?? singleQuotedValue ?? hyperscriptValue ?? bareValue ?? "true").trim();
        try {
          value = JSON.parse(value);
        } catch {}
        let isDottedPath = bareKey?.includes(".");
        let pair = isDottedPath ? key.split(".").reduceRight((acc, segment) => ({ [segment]: acc }), value) : { [key]: value };
        HCON.merge(pair, result);
      }
      return result;
    },
    split(string) {
      return string.split(/,(?![^\[]*\])(?![^(]*\))(?![^<]*\/>)(?=(?:[^"']|"[^"]*"|'[^']*')*$)/);
    },
    merge(source, target) {
      if (typeof source === "string")
        source = HCON.parse(source);
      for (let [key, val] of Object.entries(source)) {
        if (["__proto__", "constructor", "prototype"].includes(key))
          continue;
        let sourceIsObject = val?.constructor === Object;
        let targetIsObject = target[key]?.constructor === Object;
        if (sourceIsObject && targetIsObject) {
          HCON.merge(val, target[key]);
        } else {
          target[key] = val;
        }
      }
      return target;
    }
  };

  class RequestQueue {
    #current = null;
    #queue = [];
    admit(strategy, runRequest, abortRequest) {
      if (!this.#current) {
        this.#current = { strategy, abort: abortRequest };
        return "run";
      }
      if (strategy === "replace" || strategy !== "abort" && this.#current.strategy === "abort") {
        this.#queue = [];
        this.#current.abort?.();
        this.#current = { strategy, abort: abortRequest };
        return "run";
      }
      if (strategy === "queue all") {
        this.#queue.push(runRequest);
      } else if (strategy === "queue last") {
        this.#queue = [runRequest];
      } else if (strategy !== "abort" && strategy !== "drop" && this.#queue.length === 0) {
        this.#queue.push(runRequest);
      } else {
        return "dropped";
      }
      return "queued";
    }
    continue() {
      this.#current = null;
      this.#queue.shift()?.();
    }
    abort() {
      this.#current?.abort?.();
    }
  }

  class Htmx {
    #HCON = HCON;
    #extMethods = new Map;
    #approvedExt = "";
    #registeredExt = new Set;
    _loc = window.location;
    #internalAPI;
    #Function = Function;
    #AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
    #ttPolicy = { createHTML: (s) => s, createScript: (s) => s };
    #actionSelector;
    #boostSelector = "a,form";
    #verbs = ["get", "post", "put", "patch", "delete", "query"];
    #hxOnQuery;
    #transitionQueue;
    #historyAbort;
    #historyInitialized;
    #processingTransition;
    constructor() {
      this.#initHtmxConfig();
      this.#initRequestIndicatorCss();
      this.#actionSelector = this.#prefixSelector("[hx-action],[hx-get],[hx-post],[hx-put],[hx-patch],[hx-delete],[hx-query]");
      this.#hxOnQuery = new XPathEvaluator().createExpression(`.//*[@*[${this.#prefixes("hx-on").map((p) => `starts-with(name(), "${p}")`).join(" or ")}]]`);
      this.#internalAPI = {
        HCON,
        attributeValue: this.#attributeValue.bind(this),
        parseTriggerSpecs: this.#parseTriggerSpecs.bind(this),
        determineMethodAndAction: this.#determineMethodAndAction.bind(this),
        createRequestContext: this.#createRequestContext.bind(this),
        collectFormData: this.#collectFormData.bind(this),
        getAttributeObject: this.#getAttributeObject.bind(this),
        insertContent: this.#insertContent.bind(this),
        morph: this.#morph.bind(this),
        isSoftMatch: this.#isSoftMatch.bind(this),
        initSecurity: (ttPolicy, syncFn, asyncFn) => {
          if (ttPolicy)
            this.#ttPolicy = ttPolicy;
          if (syncFn)
            this.#Function = syncFn;
          if (asyncFn)
            this.#AsyncFunction = asyncFn;
        },
        onTrigger: this.#onTrigger.bind(this),
        htmxProp: this.#htmxProp.bind(this),
        triggerHtmxEvent: this.#trigger.bind(this),
        executeJavaScript: this.#executeJavaScript.bind(this)
      };
      let init = () => this.initialize();
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
      } else {
        setTimeout(init);
      }
    }
    #initHtmxConfig() {
      this.version = "4.0.0";
      this.config = {
        logAll: false,
        prefix: "data-hx-",
        transitions: false,
        history: true,
        mode: "same-origin",
        defaultSwap: "innerHTML",
        defaultFocusScroll: false,
        indicatorClass: "htmx-indicator",
        requestClass: "htmx-request",
        includeIndicatorCSS: true,
        defaultTimeout: 60000,
        extensions: "",
        morphIgnore: ["data-htmx-powered"],
        morphSkip: "[hx-morph-skip]",
        morphSkipChildren: "[hx-morph-skip-children]",
        morphScanLimit: 10,
        noSwap: [204, 304],
        implicitInheritance: false,
        defaultSettleDelay: 1,
        allowEmptySwapAfterOOB: false
      };
      let metaConfig = document.querySelector('meta[name="htmx-config"]');
      if (metaConfig) {
        HCON.merge(metaConfig.content, this.config);
      }
      this.#approvedExt = this.config.extensions;
    }
    #initRequestIndicatorCss() {
      if (this.config.includeIndicatorCSS !== false) {
        let indicator = this.config.indicatorClass;
        let request = this.config.requestClass;
        let sheet = new CSSStyleSheet;
        sheet.replaceSync(`.${indicator}{opacity:0;visibility: hidden} ` + `.${request} .${indicator}, .${request}.${indicator}{opacity:1;visibility: visible;transition: opacity 200ms ease-in}`);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      }
    }
    registerExtension(name, extension) {
      if (this.#approvedExt && !this.#approvedExt.split(/,\s*/).includes(name))
        return false;
      if (this.#registeredExt.has(name))
        return false;
      this.#registeredExt.add(name);
      if (extension.init)
        extension.init(this.#internalAPI);
      Object.entries(extension).forEach(([key, value]) => {
        if (!this.#extMethods.get(key)?.push(value))
          this.#extMethods.set(key, [value]);
      });
    }
    #ignore(elt) {
      let p = this.config.prefix;
      return !elt.closest || elt.closest("[hx-ignore]") != null || p && elt.closest(`[${p}ignore]`) != null;
    }
    #attr(elt, name) {
      let p = this.config.prefix;
      return elt.getAttribute(name) ?? (p ? elt.getAttribute(name.replace("hx-", p)) : null);
    }
    #attrName(elt, name) {
      let p = this.config.prefix && name.replace("hx-", this.config.prefix);
      return elt.hasAttribute(name) ? name : p && elt.hasAttribute(p) ? p : null;
    }
    #prefixSelector(s) {
      return this.#prefixes(s).join(",");
    }
    #prefixes(s) {
      let result = [s];
      if (this.config.prefix)
        result.push(s.replaceAll("hx-", this.config.prefix));
      return result;
    }
    #queryEltAndDescendants(elt, selector) {
      let results = [...elt.querySelectorAll?.(selector) ?? []];
      if (elt.matches?.(selector)) {
        results.unshift(elt);
      }
      return results;
    }
    #normalizeSwapStyle(style) {
      return style === "before" ? "beforebegin" : style === "after" ? "afterend" : style === "prepend" ? "afterbegin" : style === "append" ? "beforeend" : style;
    }
    #findThisElements(elt, attrName) {
      let result = [];
      this.#attributeValue(elt, attrName, undefined, (val, elt2) => {
        if (val?.split(/\s*[,:]\s*/).includes("this"))
          result.push(elt2);
      });
      return result;
    }
    #attributeValue(elt, name, defaultVal, eltCollector) {
      name = this.#maybeAdjustMetaCharacter(name);
      let inherited = this.#maybeAdjustMetaCharacter(":inherited");
      let append = this.#maybeAdjustMetaCharacter(":append");
      let val = this.#attr(elt, name) ?? this.#attr(elt, name + inherited);
      if (val != null)
        return eltCollector ? eltCollector(val, elt) : val;
      let n1 = CSS.escape(this.config.implicitInheritance ? name : name + inherited);
      let n2 = CSS.escape(name + inherited + append);
      let inheritSelector = this.#prefixSelector(`[${n1}],[${n2}]`);
      let appendName = this.#attrName(elt, name + append) ?? this.#attrName(elt, name + inherited + append);
      if (appendName) {
        let appendValue = elt.getAttribute(appendName);
        let parent2 = elt.parentNode?.closest?.(inheritSelector);
        if (eltCollector)
          eltCollector(appendValue, elt);
        if (parent2) {
          let parentVal = this.#attributeValue(parent2, name, undefined, eltCollector);
          return parentVal ? (parentVal + "," + appendValue).replace(/[{}]/g, "") : appendValue;
        }
        return appendValue;
      }
      let parent = elt.parentNode?.closest?.(inheritSelector);
      if (parent) {
        val = this.#attributeValue(parent, name, undefined, eltCollector);
        if (!eltCollector && val && this.config.implicitInheritance) {
          this.#triggerExtensions(elt, "htmx:after:implicitInheritance", { elt, name, parent });
        }
        return val;
      }
      return defaultVal;
    }
    #parseTriggerSpecs(spec) {
      return HCON.split(spec).flatMap((s) => {
        let [, name, rest] = s.match(/^\s*(\S+\[[^\]]*\]|\S+)\s*(.*?)\s*$/) ?? [];
        if (!name)
          return [];
        if (/\[[^\]]*$/.test(name))
          throw "unterminated:" + name;
        return [{ name, ...HCON.parse(rest) }];
      });
    }
    #determineMethodAndAction(elt, evt) {
      let method = this.#attributeValue(elt, "hx-method");
      let action = this.#attributeValue(elt, "hx-action");
      if (!action) {
        for (let verb of this.#verbs) {
          let verbAction = this.#attributeValue(elt, "hx-" + verb);
          if (verbAction != null) {
            action = verbAction;
            method = verb;
            break;
          }
        }
      }
      if (this.#isBoosted(elt)) {
        action ||= evt.submitter?.getAttribute?.("formAction") || elt.getAttribute(elt.matches("a") ? "href" : "action");
      }
      method ||= evt.submitter?.getAttribute?.("formmethod") || elt.getAttribute("method") || "GET";
      return { action, method: method.toUpperCase() };
    }
    #htmxProp(elt) {
      if (!elt._htmx) {
        elt._htmx = { listeners: [], triggerSpecs: [] };
        elt.setAttribute("data-htmx-powered", "true");
      }
      return elt._htmx;
    }
    #htmxState(elt) {
      return elt._htmx_state ||= {};
    }
    #initializeElement(elt) {
      if (this.#shouldInitialize(elt) && this.#trigger(elt, "htmx:before:init", {}, true)) {
        let htmxProp = this.#htmxProp(elt);
        htmxProp.initialized = true;
        htmxProp.eventHandler = this.#createHtmxEventHandler(elt);
        this.#initializeTriggers(elt);
        this.#trigger(elt, "htmx:after:init", {}, true);
      }
    }
    #createHtmxEventHandler(elt) {
      return async (evt) => {
        try {
          let ctx = this.#createRequestContext(elt, evt);
          await this.#handleTriggerEvent(ctx);
        } catch (e) {
          this.#trigger(elt, "htmx:error", { error: e });
        }
      };
    }
    #createRequestContext(sourceElement, sourceEvent) {
      let { action, method } = this.#determineMethodAndAction(sourceElement, sourceEvent);
      let [fullAction, anchor] = (action || "").split("#");
      let ac = new AbortController;
      let ctx = {
        sourceElement,
        sourceEvent,
        status: "created",
        select: this.#attributeValue(sourceElement, "hx-select"),
        selectOOB: this.#attributeValue(sourceElement, "hx-select-oob"),
        target: this.#attributeValue(sourceElement, "hx-target"),
        swap: this.#attributeValue(sourceElement, "hx-swap") ?? this.config.defaultSwap,
        push: this.#attributeValue(sourceElement, "hx-push-url"),
        replace: this.#attributeValue(sourceElement, "hx-replace-url"),
        transition: this.config.transitions,
        confirm: this.#attributeValue(sourceElement, "hx-confirm"),
        request: {
          validate: this.#attributeValue(sourceElement, "hx-validate", sourceElement.matches("form") && !sourceElement.noValidate && !sourceEvent.submitter?.formNoValidate ? "true" : "false") === "true",
          action: fullAction,
          anchor,
          method,
          headers: this.#createCoreHeaders(sourceElement),
          abort: ac.abort.bind(ac),
          credentials: "same-origin",
          signal: ac.signal,
          mode: this.config.mode
        }
      };
      if (sourceElement._htmx?.boosted) {
        HCON.merge(sourceElement._htmx.boosted, ctx);
      }
      ctx.target = this.#resolveTarget(sourceElement, ctx.target);
      if (ctx.target) {
        ctx.request.headers["HX-Target"] = this.#buildIdentifier(ctx.target);
      }
      let hxConfig = this.#attributeValue(sourceElement, "hx-config");
      if (hxConfig) {
        HCON.merge(hxConfig, ctx.request);
        ctx.request.mode = this.config.mode;
      }
      return ctx;
    }
    #buildIdentifier(elt) {
      return `${elt.tagName.toLowerCase()}${elt.id ? "#" + encodeURI(elt.id) : ""}`;
    }
    #createCoreHeaders(elt) {
      let headers = {
        "HX-Request": "true",
        "HX-Source": this.#buildIdentifier(elt),
        "HX-Current-URL": location.href,
        Accept: "text/html"
      };
      if (this.#isBoosted(elt)) {
        headers["HX-Boosted"] = "true";
      }
      return headers;
    }
    #handleHxHeaders(elt, ctx) {
      return this.#getAttributeObject(elt, "hx-headers", (obj) => {
        for (let key in obj)
          ctx.request.headers[key] = String(obj[key]);
      }, { ctx });
    }
    #resolveTarget(elt, selector) {
      if (selector instanceof Element) {
        return selector;
      } else if (selector != null) {
        return this.#findOrWarn(elt, selector, "hx-target");
      } else if (this.#isBoosted(elt)) {
        return document.body;
      } else {
        return elt;
      }
    }
    #isBoosted(elt) {
      return elt?._htmx?.boosted;
    }
    async#handleTriggerEvent(ctx) {
      let elt = ctx.sourceElement;
      let evt = ctx.sourceEvent;
      if (!elt.isConnected)
        return;
      if (this.#isModifierKeyClick(evt))
        return;
      if (this.#shouldCancel(evt))
        evt.preventDefault();
      let usesQueryParams = /GET|DELETE/.test(ctx.request.method);
      let form = usesQueryParams ? elt.matches("form") ? elt : null : elt.form || elt.closest("form");
      let body = this.#collectFormData(elt, form, evt.submitter, ctx.request.validate, usesQueryParams);
      if (!body)
        return;
      let valsResult = this.#getAttributeObject(elt, "hx-vals", (obj) => {
        ctx.vals = obj;
        for (let key in obj)
          body.set(key, obj[key]);
      }, { ctx });
      if (valsResult)
        await valsResult;
      if (ctx.values) {
        for (let k in ctx.values) {
          body.delete(k);
          body.append(k, ctx.values[k]);
        }
      }
      let headersResult = this.#handleHxHeaders(elt, ctx);
      if (headersResult)
        await headersResult;
      Object.assign(ctx.request, {
        form,
        submitter: evt.submitter,
        body
      });
      if (!this.#trigger(elt, "htmx:config:request", { ctx }))
        return;
      if (ctx.request.method === "DIALOG")
        return;
      let javascriptContent = this.#extractJavascriptContent(ctx.request.action);
      if (javascriptContent != null) {
        let data = Object.fromEntries(ctx.request.body);
        await this.#executeJavaScript(ctx.sourceElement, data, javascriptContent, false);
        return;
      } else if (usesQueryParams) {
        let url = new URL(ctx.request.action, document.baseURI);
        for (let key of ctx.request.body.keys()) {
          url.searchParams.delete(key);
        }
        for (let [key, value] of ctx.request.body) {
          url.searchParams.append(key, value);
        }
        if (url.origin === location.origin) {
          ctx.request.action = url.pathname + url.search;
        } else {
          ctx.request.action = url.href;
        }
        ctx.request.body = null;
      } else if ((this.#attributeValue(elt, "hx-encoding") ?? form?.enctype) !== "multipart/form-data") {
        ctx.request.body = new URLSearchParams(ctx.request.body);
      }
      await this.#issueRequest(ctx);
    }
    async#issueRequest(ctx) {
      let elt = ctx.sourceElement;
      let syncStrategy = this.#determineSyncStrategy(elt);
      let requestQueue = this.#getRequestQueue(elt);
      this.#initializeAbortListener(elt);
      if (requestQueue.admit(syncStrategy, () => this.#issueRequest(ctx), () => ctx.request?.abort?.()) !== "run")
        return;
      ctx.status = "issuing";
      let indicators = [];
      let disableElements = [];
      try {
        if (ctx.confirm) {
          let confirmed = await new Promise((resolve) => {
            let detail = { ctx, issueRequest: () => resolve(true), dropRequest: () => resolve(false) };
            if (this.#trigger(elt, "htmx:confirm", detail)) {
              let js = this.#extractJavascriptContent(ctx.confirm);
              resolve(js ? this.#executeJavaScript(elt, { ctx }, js, true) : window.confirm(ctx.confirm));
            }
          });
          if (!confirmed)
            return;
        }
        this.#initTimeout(ctx);
        indicators = this.#showIndicators(elt);
        disableElements = this.#disableElements(elt);
        ctx.fetch ||= window.fetch.bind(window);
        ctx.request.headers["HX-Request-Type"] = ctx.target === document.body || ctx.select ? "full" : "partial";
        if (!this.#trigger(elt, "htmx:before:request", { ctx }))
          return;
        let response = await ctx.fetch(ctx.request.action, ctx.request);
        ctx.response = {
          raw: response,
          status: response.status,
          headers: response.headers
        };
        this.#extractHxHeaders(ctx);
        if (!this.#trigger(elt, "htmx:before:response", { ctx }))
          return;
        ctx.text = await response.text();
        if (!this.#trigger(elt, "htmx:after:request", { ctx }))
          return;
        if (ctx.response.status >= 400) {
          this.#trigger(elt, "htmx:response:error", { ctx });
        }
        if (this.#handleHeadersAndMaybeReturnEarly(ctx)) {
          ctx.keepIndicators = true;
          return;
        }
        if (ctx.status === "issuing") {
          if (ctx.hx.retarget)
            ctx.target = ctx.hx.retarget;
          if (ctx.hx.reswap)
            ctx.swap = ctx.hx.reswap;
          if (ctx.hx.reselect)
            ctx.select = ctx.hx.reselect;
          ctx.status = "response received";
          this.#handleStatusCodes(ctx);
          await this.swap(ctx);
          ctx.status = "swapped";
        }
      } catch (error2) {
        ctx.status = "error: " + error2;
        this.#trigger(elt, "htmx:error", { ctx, error: error2 });
      } finally {
        await ctx.extensionPromise?.catch(() => {});
        clearTimeout(ctx.requestTimeout);
        if (ctx.hx?.trigger) {
          this.#handleTriggerHeader(ctx.hx.trigger, ctx.sourceElement);
        }
        this.#trigger(elt, "htmx:finally:request", { ctx });
        if (!ctx.keepIndicators) {
          this.#hideIndicators(indicators);
          this.#enableElements(disableElements);
        }
        requestQueue.continue();
      }
    }
    #extractHxHeaders(ctx) {
      ctx.hx = {};
      for (let [k, v] of ctx.response.raw.headers) {
        if (k.toLowerCase().startsWith("hx-")) {
          ctx.hx[k.slice(3).toLowerCase().replace(/-/g, "")] = v;
        }
      }
    }
    #handleHeadersAndMaybeReturnEarly(ctx) {
      if (ctx.hx.refresh === "true") {
        this._loc.reload();
        return true;
      }
      if (ctx.hx.redirect) {
        this._loc.href = ctx.hx.redirect;
        return true;
      }
      if (ctx.hx.location) {
        let path = ctx.hx.location, opts = {};
        let parsed = HCON.parse(path);
        if (path[0] === "{" || parsed.path != null) {
          opts = parsed;
          path = opts.path;
          delete opts.path;
        }
        if (opts.push == null && opts.replace == null)
          opts.push = "true";
        this.ajax("GET", path, opts);
        return true;
      }
    }
    #initTimeout(ctx) {
      let timeout = ctx.request.timeout != null ? this.parseInterval(ctx.request.timeout) : this.config.defaultTimeout;
      if (timeout) {
        ctx.requestTimeout = setTimeout(() => ctx.request?.abort?.(), timeout);
      }
    }
    #determineSyncStrategy(elt) {
      let hxSync = this.#attributeValue(elt, "hx-sync");
      if (!hxSync)
        return "queue first";
      let strategy = hxSync.split(":").pop().trim();
      return /^(drop|abort|replace|queue)/.test(strategy) ? strategy : "queue first";
    }
    #getRequestQueue(elt) {
      let hxSync = this.#attributeValue(elt, "hx-sync");
      let syncElt = elt;
      if (hxSync) {
        let selector = hxSync.includes(":") ? hxSync.slice(0, hxSync.lastIndexOf(":")).trim() : /^(drop|abort|replace|queue)/.test(hxSync) ? null : hxSync;
        if (selector)
          syncElt = this.#findOrWarn(elt, selector, "hx-sync") || elt;
      }
      return this.#htmxState(syncElt).rq ||= new RequestQueue;
    }
    #isModifierKeyClick(evt) {
      return evt.type === "click" && (evt.ctrlKey || evt.metaKey || evt.shiftKey) && !!evt.currentTarget?.closest?.("a[href]");
    }
    #shouldCancel(evt) {
      let elt = evt.currentTarget;
      let isSubmit = evt.type === "submit" && elt?.tagName === "FORM";
      if (isSubmit)
        return true;
      let isClick = evt.type === "click" && evt.button === 0;
      if (!isClick)
        return false;
      let btn = elt?.closest?.('button, input[type="submit"], input[type="image"]');
      let form = btn?.form || btn?.closest("form");
      let isSubmitButton = btn && !btn.disabled && form && (btn.type === "submit" || btn.type === "image" || !btn.type && btn.tagName === "BUTTON");
      if (isSubmitButton)
        return true;
      let link = elt?.closest?.("a");
      if (!link || !link.href)
        return false;
      let href = link.getAttribute("href");
      let isFragmentOnly = href && href.startsWith("#") && href.length > 1;
      return !isFragmentOnly;
    }
    #initializeTriggers(elt, initialHandler = elt._htmx.eventHandler) {
      let hxTrigger = this.#attributeValue(elt, "hx-trigger");
      let trigger = hxTrigger || (elt.matches("form") ? "submit" : elt.matches("input:not([type=button]):not([type=submit]),select,textarea") ? "change" : "click");
      this.#onTrigger(elt, trigger, initialHandler);
    }
    #onTrigger(elt, specString, handler) {
      let specs = this.#parseTriggerSpecs(specString);
      this.#htmxProp(elt).triggerSpecs.push(...specs);
      for (let spec of specs) {
        spec.listeners = [];
        let [eventName, filter] = this.#extractFilter(spec.name);
        let fromElts = [elt];
        if (spec.from === "outside")
          fromElts = [document];
        else if (spec.from && spec.from !== "self")
          fromElts = this.#findAllExt(elt, spec.from);
        let inner = (evt) => {
          if (spec.halt || spec.prevent)
            evt.preventDefault();
          if (spec.halt || spec.stop || spec.consume)
            evt.stopPropagation();
          if (spec.once) {
            for (let info of spec.listeners)
              info.fromElt.removeEventListener(info.eventName, info.handler, info);
          }
          handler(evt);
        };
        let timed = inner;
        if (spec.delay) {
          timed = (evt) => {
            clearTimeout(spec.timeout);
            spec.timeout = setTimeout(() => inner(evt), this.parseInterval(spec.delay));
          };
        } else if (spec.throttle) {
          timed = (evt) => {
            if (spec.throttled) {
              spec.throttledEvent = evt;
            } else {
              spec.throttled = true;
              inner(evt);
              spec.throttleTimeout = setTimeout(() => {
                spec.throttled = false;
                if (spec.throttledEvent) {
                  let e = spec.throttledEvent;
                  spec.throttledEvent = null;
                  timed(e);
                }
              }, this.parseInterval(spec.throttle));
            }
          };
        }
        spec.handler = (evt) => {
          if (spec.from === "self" && evt.target !== elt)
            return;
          if (spec.from === "outside" && elt.contains(evt.target))
            return;
          if (spec.target && !evt.target?.matches?.(spec.target))
            return;
          if (spec.changed) {
            let values = spec.values ??= new WeakMap;
            let changed = false;
            for (let fromElt of fromElts) {
              if (values.get(fromElt) !== fromElt.value) {
                changed = true;
                values.set(fromElt, fromElt.value);
              }
            }
            if (!changed)
              return;
          }
          if (filter) {
            if (this.#shouldCancel(evt))
              evt.preventDefault();
            let evtArgs = {};
            for (let k in evt)
              evtArgs[k] = evt[k];
            if (!this.#executeJavaScript(elt, evtArgs, filter, true, false))
              return;
          }
          timed(evt);
        };
        if (eventName === "intersect" || eventName === "revealed") {
          let observerOptions = { rootMargin: spec.rootMargin };
          if (spec.root)
            observerOptions.root = this.#findOrWarn(elt, spec.root);
          if (spec.threshold)
            observerOptions.threshold = parseFloat(spec.threshold);
          let isRevealed = eventName === "revealed";
          spec.observer = new IntersectionObserver((entries) => {
            for (let i = 0;i < entries.length; i++) {
              if (entries[i].isIntersecting) {
                this.trigger(elt, "intersect", {}, false);
                if (isRevealed)
                  spec.observer.disconnect();
                break;
              }
            }
          }, observerOptions);
          eventName = "intersect";
          spec.observer.observe(elt);
        }
        if (eventName === "every") {
          let interval = Object.keys(spec).find((k) => k !== "name");
          spec.interval = setInterval(() => {
            if (elt.isConnected)
              this.#trigger(elt, "every", {}, false);
            else
              clearInterval(spec.interval);
          }, this.parseInterval(interval));
        }
        if (eventName === "load") {
          spec.handler(new CustomEvent("load"));
          continue;
        }
        for (let fromElt of fromElts) {
          let listenerInfo = {
            fromElt,
            eventName,
            handler: spec.handler,
            capture: !!spec.capture,
            passive: !!spec.passive
          };
          elt._htmx.listeners.push(listenerInfo);
          spec.listeners.push(listenerInfo);
          fromElt.addEventListener(eventName, spec.handler, listenerInfo);
        }
      }
    }
    #extractFilter(str) {
      let match = str.match(/^([^\[]*)\[([^\]]*)]/);
      if (!match)
        return [str, null];
      return [match[1], match[2]];
    }
    #handleTriggerHeader(value, elt) {
      if (value[0] === "{") {
        let triggers = HCON.parse(value);
        for (let name in triggers) {
          let detail = triggers[name];
          let target = elt;
          if (detail?.target) {
            target = this.find(detail.target);
          }
          this.trigger(target, name, typeof detail === "object" ? detail : { value: detail });
        }
      } else {
        value.split(",").forEach((name) => this.trigger(elt, name.trim(), {}));
      }
    }
    #apiMethods(thisArg) {
      let bound = {};
      let proto = Object.getPrototypeOf(this);
      for (let name of Object.getOwnPropertyNames(proto)) {
        if (name !== "constructor" && typeof this[name] === "function") {
          if (["find", "findAll"].includes(name)) {
            bound[name] = (arg1, arg2) => {
              if (arg2 === undefined) {
                return this[name](thisArg, arg1);
              } else {
                return this[name](arg1, arg2);
              }
            };
          } else {
            bound[name] = this[name].bind(this);
          }
        }
      }
      return bound;
    }
    #executeJavaScript(thisArg, obj, code, expression = true, isAsync = true, compile = false) {
      let args = {};
      Object.assign(args, this.#apiMethods(thisArg));
      let scope = {};
      let detail = { scope, code };
      this.#triggerExtensions(thisArg, "htmx:scope", detail);
      code = detail.code;
      Object.assign(args, scope);
      Object.assign(args, obj);
      let keys = Object.keys(args);
      let values = Object.values(args);
      let FunctionConstructor = isAsync ? this.#AsyncFunction : this.#Function;
      let func = new FunctionConstructor(...keys, expression ? `return (${code})` : code);
      return compile ? () => func.call(thisArg, ...values) : func.call(thisArg, ...values);
    }
    process(root, force) {
      if (!root?.isConnected)
        return;
      if (!(root instanceof Element)) {
        for (let elt of root.children || [])
          this.process(elt, force);
        return;
      }
      if (force)
        this.#cleanup(root, true);
      if (this.#ignore(root))
        return;
      if (!this.#trigger(root, "htmx:before:process"))
        return;
      let hxOnNodes = [root];
      let iter = this.#hxOnQuery.evaluate(root);
      let node = null;
      while (node = iter.iterateNext())
        hxOnNodes.push(node);
      for (let hxOnNode of hxOnNodes) {
        if (!this.#ignore(hxOnNode) && this.#trigger(hxOnNode, "htmx:before:on:init", {}, true)) {
          this.#handleHxOnAttributes(hxOnNode);
        }
      }
      for (let elt of this.#queryEltAndDescendants(root, this.#actionSelector)) {
        this.#initializeElement(elt);
      }
      for (let elt of this.#queryEltAndDescendants(root, this.#boostSelector)) {
        this.#maybeBoost(elt);
      }
      this.#trigger(root, "htmx:after:process");
    }
    #maybeBoost(elt) {
      let hxBoost = this.#attributeValue(elt, "hx-boost");
      if (hxBoost && hxBoost !== "false" && this.#shouldBoost(elt) && this.#trigger(elt, "htmx:before:init", {}, true)) {
        let htmxProp = this.#htmxProp(elt);
        htmxProp.initialized = true;
        htmxProp.eventHandler = this.#createHtmxEventHandler(elt);
        htmxProp.boosted = hxBoost;
        let eventName = elt.matches("a") ? "click" : "submit";
        elt._htmx.listeners.push({ fromElt: elt, eventName, handler: elt._htmx.eventHandler });
        elt.addEventListener(eventName, elt._htmx.eventHandler);
        this.#trigger(elt, "htmx:after:init", {}, true);
      }
    }
    #shouldBoost(elt) {
      if (this.#shouldInitialize(elt)) {
        if (elt.tagName === "A") {
          if (elt.target === "" || elt.target === "_self") {
            return !elt.hasAttribute("download") && !elt.getAttribute("href")?.startsWith?.("#") && this.#isSameOrigin(elt.href);
          }
        } else if (elt.tagName === "FORM") {
          return elt.method !== "dialog" && this.#isSameOrigin(elt.action);
        }
      }
    }
    #isSameOrigin(url) {
      try {
        const parsed = new URL(url, window.location.href);
        return parsed.origin === window.location.origin;
      } catch (e) {
        return false;
      }
    }
    #shouldInitialize(elt) {
      return !elt._htmx?.initialized && !this.#ignore(elt);
    }
    #cleanup(elt, force) {
      let elts = [elt, ...elt.querySelectorAll?.("[data-htmx-powered]") ?? []];
      for (let e of elts) {
        if (!e._htmx)
          continue;
        this.#trigger(e, "htmx:before:cleanup");
        for (let spec of e._htmx.triggerSpecs || []) {
          if (spec.interval)
            clearInterval(spec.interval);
          if (spec.timeout)
            clearTimeout(spec.timeout);
          if (spec.throttleTimeout)
            clearTimeout(spec.throttleTimeout);
          spec.observer?.disconnect();
        }
        for (let info of e._htmx.listeners || []) {
          info.fromElt.removeEventListener(info.eventName, info.handler, info);
        }
        e.removeAttribute("data-htmx-powered");
        this.#trigger(e, "htmx:after:cleanup");
        if (force)
          delete e._htmx;
      }
    }
    #handlePreservedElements(fragment) {
      let pantry = document.createElement("div");
      pantry.hidden = true;
      document.body.insertAdjacentElement("afterend", pantry);
      let newPreservedElts = fragment.querySelectorAll?.(this.#prefixSelector("[hx-preserve]")) || [];
      for (let preservedElt of newPreservedElts) {
        let currentElt = document.getElementById(preservedElt.id);
        if (currentElt) {
          this.#moveBefore(pantry, currentElt, null);
        }
      }
      return pantry;
    }
    #restorePreservedElements(pantry) {
      for (let preservedElt of [...pantry.children]) {
        let newElt = document.getElementById(preservedElt.id);
        if (newElt) {
          this.#moveBefore(newElt.parentNode, preservedElt, newElt);
          this.#cleanup(newElt);
          newElt.remove();
        }
      }
      pantry.remove();
    }
    #parseHTML(resp) {
      let trusted = this.#ttPolicy.createHTML(resp);
      return Document.parseHTMLUnsafe?.(trusted) || new DOMParser().parseFromString(trusted, "text/html");
    }
    #makeFragment(text) {
      let response = text.replace(/<hx-([a-z]+)(\s+|>)/gi, '<template hx type="$1"$2').replace(/<\/hx-[a-z]+>/gi, "</template>");
      let title = "";
      response = response.replace(/<head(\s[^>]*)?>[\s\S]*?<\/head>/i, (m) => (title = this.#parseHTML(m).title, ""));
      let startTag = response.match(/<([a-z][^\/>\x20\t\r\n\f]*)/i)?.[1]?.toLowerCase();
      let doc, fragment;
      if (startTag === "html" || startTag === "body") {
        doc = this.#parseHTML(response);
        fragment = document.createDocumentFragment();
        fragment.append(doc.body);
      } else {
        doc = this.#parseHTML(`<template>${response}</template>`);
        fragment = doc.querySelector("template").content;
      }
      if (!title) {
        let titleElt = fragment.querySelector("title:not(svg title)");
        if (titleElt) {
          title = titleElt.textContent;
          titleElt.remove();
        }
      }
      this.#processScripts(fragment);
      return {
        fragment,
        title
      };
    }
    #createOOBTask(tasks, elt, oobValue, sourceElement) {
      let targetSelector = elt.id ? "#" + CSS.escape(elt.id) : null;
      if (oobValue !== "true" && oobValue && !oobValue.includes(" ")) {
        [oobValue, targetSelector = targetSelector] = oobValue.split(/:(.*)/);
      }
      if (oobValue === "true" || !oobValue)
        oobValue = "outerHTML";
      let swapSpec = this.#parseSwapSpec(oobValue);
      targetSelector = swapSpec.target || targetSelector;
      swapSpec.strip ??= !swapSpec.style.startsWith("outer");
      if (!targetSelector)
        return;
      let targets = [...document.querySelectorAll(targetSelector)];
      for (let target of targets) {
        let fragment = document.createDocumentFragment();
        fragment.append(elt.cloneNode(true));
        tasks.push({ type: "oob", fragment, target, swapSpec, sourceElement });
      }
      elt.remove();
    }
    #processOOB(fragment, sourceElement, selectOOB) {
      let tasks = [];
      if (selectOOB) {
        for (let spec of selectOOB.split(",")) {
          let [selector, oobValue = "true"] = spec.split(/:(.*)/);
          for (let elt of fragment.querySelectorAll(selector)) {
            this.#createOOBTask(tasks, elt, oobValue, sourceElement);
          }
        }
      }
      for (let oobElt of fragment.querySelectorAll(this.#prefixSelector("[hx-swap-oob]"))) {
        let oobAttr = this.#attrName(oobElt, "hx-swap-oob");
        let oobValue = oobElt.getAttribute(oobAttr);
        oobElt.removeAttribute(oobAttr);
        this.#createOOBTask(tasks, oobElt, oobValue, sourceElement);
      }
      return tasks;
    }
    #insertNodes(parent, before, fragment) {
      if (before) {
        before.before(...fragment.childNodes);
      } else {
        parent.append(...fragment.childNodes);
      }
    }
    #parseSwapSpec(swapStr) {
      swapStr = swapStr.trim();
      let style = this.config.defaultSwap;
      if (swapStr && !/^\S*:/.test(swapStr)) {
        let m = swapStr.match(/^(\S+)\s*(.*)$/);
        style = m[1];
        swapStr = m[2];
      }
      return { style: this.#normalizeSwapStyle(style), ...HCON.parse(swapStr) };
    }
    #processPartials(fragment, ctx) {
      let tasks = [];
      for (let templateElt of fragment.querySelectorAll("template[hx]")) {
        let type = templateElt.getAttribute("type");
        if (type === "partial") {
          let targetSelector = this.#attr(templateElt, "hx-target") || (templateElt.id ? "#" + CSS.escape(templateElt.id) : null);
          if (targetSelector) {
            this.#processScripts(templateElt.content);
            let swapSpec = this.#parseSwapSpec(this.#attr(templateElt, "hx-swap") || this.config.defaultSwap);
            let targets = this.#findAllExt(ctx.sourceElement, targetSelector);
            for (let target of targets.length ? targets : [null]) {
              tasks.push({
                type: "partial",
                fragment: templateElt.content.cloneNode(true),
                target,
                swapSpec,
                sourceElement: ctx.sourceElement
              });
            }
          }
        } else {
          this.#triggerExtensions(templateElt, "htmx:process:" + type, { ctx, tasks });
        }
        templateElt.remove();
      }
      return tasks;
    }
    #setFocus(elt, options, start, end) {
      try {
        if (start != null && elt.setSelectionRange) {
          elt.setSelectionRange(start, end);
        }
        elt.focus(options);
      } catch (e) {}
    }
    #handleAutoFocus(elt) {
      let autofocus = this.#queryEltAndDescendants(elt, "[autofocus]")[0];
      if (autofocus) {
        this.#setFocus(autofocus);
      }
    }
    #handleScroll(swapSpec, target) {
      if (swapSpec.scroll) {
        let scrollTarget = swapSpec.scrollTarget ? this.#findExt(swapSpec.scrollTarget) : target;
        if (scrollTarget) {
          if (swapSpec.scroll === "top") {
            scrollTarget.scrollTop = 0;
          } else if (swapSpec.scroll === "bottom") {
            scrollTarget.scrollTop = scrollTarget.scrollHeight;
          }
        }
      }
      if (swapSpec.show === "top" || swapSpec.show === "bottom") {
        let showTarget = swapSpec.showTarget ? this.#findExt(swapSpec.showTarget) : target;
        showTarget?.scrollIntoView?.(swapSpec.show === "top");
      }
    }
    #handleAnchorScroll(ctx) {
      if (ctx.request?.anchor) {
        document.getElementById(ctx.request.anchor)?.scrollIntoView({ block: "start", behavior: "auto" });
      }
    }
    #processScripts(container) {
      let scripts = this.#queryEltAndDescendants(container, "script");
      for (let oldScript of scripts) {
        let newScript = document.createElement("script");
        for (let attr of oldScript.attributes) {
          newScript.setAttribute(attr.name, attr.value);
        }
        if (this.config.inlineScriptNonce) {
          newScript.nonce = this.config.inlineScriptNonce;
        }
        newScript.textContent = this.#ttPolicy.createScript(oldScript.textContent);
        oldScript.replaceWith(newScript);
      }
    }
    initialize() {
      if (this.config.history && !this.#historyInitialized) {
        this.#historyInitialized = true;
        if (!history.state)
          history.replaceState({ htmx: true }, "", location.href);
        if (window.navigation && !/firefox/i.test(navigator.userAgent)) {
          navigation.addEventListener("navigate", (event) => {
            if (event.navigationType === "traverse" && event.canIntercept && !event.hashChange)
              event.intercept({ handler: () => this.#restoreHistory() });
          });
        } else {
          window.addEventListener("popstate", (event) => this.#restoreHistory(event.state));
        }
      }
      this.process(document.body);
    }
    async swap(ctx) {
      try {
        this.#handleHistoryUpdate(ctx);
        let { fragment, title } = this.#makeFragment(ctx.text);
        ctx.title = title;
        let tasks = [];
        let oobTasks = this.#processOOB(fragment, ctx.sourceElement, ctx.selectOOB);
        let partialTasks = this.#processPartials(fragment, ctx);
        tasks.push(...oobTasks, ...partialTasks);
        let hasPartials = partialTasks.length || oobTasks.length && !this.config.allowEmptySwapAfterOOB;
        let mainSwap = this.#processMainSwap(ctx, fragment, hasPartials);
        if (mainSwap) {
          tasks.unshift(mainSwap);
        }
        if (!this.#trigger(ctx.sourceElement, "htmx:before:swap", { ctx, tasks })) {
          return;
        }
        let swapPromises = [];
        let transitionTasks = [];
        for (let task of tasks) {
          if (task.swapSpec?.transition ?? mainSwap?.transition ?? ctx.transition) {
            transitionTasks.push(task);
          } else {
            swapPromises.push(this.#insertContent(task));
          }
        }
        if (transitionTasks.length > 0) {
          let tasksWrapper = async () => {
            for (let task of transitionTasks) {
              await this.#insertContent(task, false);
            }
          };
          swapPromises.push(this.#submitTransitionTask(tasksWrapper, ctx));
        }
        await Promise.all(swapPromises);
        if (!ctx.sourceElement?.isConnected && mainSwap?.target?.isConnected) {
          ctx.sourceElement = mainSwap.target;
        }
        this.#trigger(ctx.sourceElement, "htmx:after:swap", { ctx });
        if (ctx.title && !mainSwap?.swapSpec?.ignoreTitle)
          document.title = ctx.title;
        this.#handleAnchorScroll(ctx);
      } finally {
        this.#trigger(ctx.sourceElement, "htmx:finally:swap", { ctx });
      }
    }
    #processMainSwap(ctx, fragment, hasPartials) {
      let swapSpec = this.#parseSwapSpec(ctx.swap || this.config.defaultSwap);
      if (swapSpec.style === "delete" || fragment.childElementCount > 0 || fragment.textContent.trim() || (swapSpec.swapEmpty ?? !hasPartials)) {
        if (ctx.select) {
          let selected = fragment.querySelectorAll(ctx.select);
          fragment = document.createDocumentFragment();
          fragment.append(...selected);
        }
        if (this.#isBoosted(ctx.sourceElement)) {
          swapSpec.show ||= "top";
        }
        let mainSwap = {
          type: "main",
          fragment,
          target: this.#resolveTarget(ctx.sourceElement || document.body, swapSpec.target || ctx.target),
          swapSpec,
          sourceElement: ctx.sourceElement,
          transition: ctx.transition && swapSpec.transition !== false
        };
        return mainSwap;
      }
    }
    async#insertContent(task, cssTransition = true) {
      let { target, swapSpec, fragment } = task;
      if (typeof target === "string") {
        target = document.querySelector(target);
      }
      if (!target)
        return;
      if (typeof swapSpec === "string") {
        swapSpec = this.#parseSwapSpec(swapSpec);
      }
      let swapStyle = swapSpec.style;
      if (swapStyle === "none")
        return;
      if (fragment.firstElementChild?.tagName === "BODY") {
        const keepBody = target === document.body && swapStyle.startsWith("outer");
        if (keepBody && swapStyle === "outerHTML")
          swapStyle = "outerSync";
        swapSpec.strip ??= !keepBody;
      }
      if (swapSpec.strip && fragment.firstElementChild) {
        fragment = document.createDocumentFragment();
        fragment.append(...(task.fragment.firstElementChild.content || task.fragment.firstElementChild).childNodes);
      }
      this.#addClass(target, "htmx-swapping");
      if (cssTransition && task.swapSpec?.swap) {
        await this.timeout(task.swapSpec?.swap);
      }
      if (swapStyle === "delete") {
        if (target.parentNode) {
          this.#cleanup(target);
          target.parentNode.removeChild(target);
        }
        return;
      }
      let focusInfo;
      let settleTasks = [];
      let settleDelay = swapSpec.settle ?? this.config.defaultSettleDelay;
      let parentNode = target.parentNode;
      if (swapStyle === "innerHTML" || swapStyle === "outerHTML" && parentNode) {
        let activeElt = document.activeElement;
        if (activeElt?.id) {
          let start, end;
          try {
            start = activeElt.selectionStart;
            end = activeElt.selectionEnd;
          } catch (e) {}
          focusInfo = { elt: activeElt, start, end };
        }
        settleTasks = cssTransition && settleDelay ? this.#startCSSTransitions(fragment, target) : [];
      }
      let pantry = this.#handlePreservedElements(fragment);
      let newContent = [...fragment.childNodes];
      try {
        if (swapStyle === "innerHTML") {
          for (const child of target.children) {
            this.#cleanup(child);
          }
          target.replaceChildren(...fragment.childNodes);
        } else if (swapStyle === "textContent") {
          for (const child of target.querySelectorAll("[data-htmx-powered]")) {
            this.#cleanup(child);
          }
          target.textContent = fragment.textContent;
        } else if (swapStyle === "outerHTML") {
          if (parentNode) {
            this.#insertNodes(parentNode, target, fragment);
            this.#cleanup(target);
            parentNode.removeChild(target);
            target = newContent[0] || parentNode;
          }
        } else if (swapStyle === "outerSync") {
          this.#copyAttributes(target, fragment.firstElementChild);
          for (const child of target.children) {
            this.#cleanup(child);
          }
          target.replaceChildren(...fragment.firstElementChild.childNodes);
          newContent = [target];
        } else if (swapStyle === "innerMorph") {
          this.#morph(target, fragment, true);
          newContent = [...target.childNodes];
        } else if (swapStyle === "outerMorph") {
          this.#morph(target, fragment, false);
          newContent.push(target);
        } else if (swapStyle === "beforebegin") {
          if (parentNode) {
            this.#insertNodes(parentNode, target, fragment);
          }
        } else if (swapStyle === "afterbegin") {
          this.#insertNodes(target, target.firstChild, fragment);
        } else if (swapStyle === "beforeend") {
          this.#insertNodes(target, null, fragment);
        } else if (swapStyle === "afterend") {
          if (parentNode) {
            this.#insertNodes(parentNode, target.nextSibling, fragment);
          }
        } else {
          let methods = this.#extMethods.get("handle_swap") || [];
          let handled = false;
          for (const method of methods) {
            let result = method(swapStyle, target, fragment, swapSpec);
            if (result) {
              handled = true;
              if (Array.isArray(result)) {
                newContent = result;
              }
              break;
            }
          }
          if (!handled) {
            throw new Error(`Unknown swap style: ${swapStyle}`);
          }
        }
      } finally {
        this.#removeClass(target, "htmx-swapping");
      }
      task.target = target;
      this.#restorePreservedElements(pantry);
      if (focusInfo && !focusInfo.elt.matches(":focus")) {
        let newElt = document.getElementById(focusInfo.elt.id);
        if (newElt) {
          let focusOptions = { preventScroll: swapSpec.focusScroll !== undefined ? !swapSpec.focusScroll : !this.config.defaultFocusScroll };
          this.#setFocus(newElt, focusOptions, focusInfo.start, focusInfo.end);
        }
      }
      this.#trigger(target, "htmx:before:settle", { task, newContent, settleTasks });
      for (const elt of newContent) {
        this.#addClass(elt, "htmx-added");
      }
      if (cssTransition && settleTasks.length > 0) {
        this.#addClass(target, "htmx-settling");
        await this.timeout(settleDelay);
        for (let settleTask of settleTasks) {
          settleTask();
        }
        this.#removeClass(target, "htmx-settling");
      }
      this.#trigger(target, "htmx:after:settle", { task, newContent, settleTasks });
      for (const elt of newContent) {
        this.#removeClass(elt, "htmx-added");
        this.process(elt);
        this.#handleAutoFocus(elt);
      }
      this.#handleScroll(swapSpec, target);
    }
    #trigger(on, eventName, detail = {}, bubbles = true) {
      if (detail.error) {
        let prefix = `htmx: ${eventName}: ${detail.error.message ?? detail.error}`;
        if (detail.error instanceof Error)
          console.error(prefix, detail.error, { elt: on, detail });
        else
          console.error(prefix, { elt: on, detail });
      } else if (detail.warn) {
        console.warn(`htmx: ${eventName}: ${detail.warn}`, { elt: on, detail });
      } else if (this.config.logAll) {
        console.log(`htmx: ${eventName}`, { elt: on, detail });
      }
      on = this.#normalizeElement(on);
      this.#triggerExtensions(on, eventName, detail);
      return this.trigger(on, this.#maybeAdjustMetaCharacter(eventName), detail, bubbles);
    }
    #triggerExtensions(elt, eventName, detail = {}) {
      let methods = this.#extMethods.get(eventName.replace(/:/g, "_"));
      if (methods) {
        detail.cancelled = false;
        for (const fn of methods) {
          if (fn(elt, detail) === false || detail.cancelled) {
            detail.cancelled = true;
            return false;
          }
        }
      }
      return true;
    }
    timeout(time) {
      time = this.parseInterval(time);
      if (time > 0) {
        return new Promise((resolve) => setTimeout(resolve, time));
      }
    }
    onLoad(callback) {
      this.on(this.#maybeAdjustMetaCharacter("htmx:after:process"), (evt) => {
        callback(evt.target);
      });
    }
    on(eventOrElt, eventOrCallback, callback) {
      let event;
      let elt = document;
      if (callback === undefined) {
        event = eventOrElt;
        callback = eventOrCallback;
      } else {
        elt = this.#normalizeElement(eventOrElt);
        event = eventOrCallback;
      }
      elt.addEventListener(event, callback);
      return callback;
    }
    find(selectorOrElt, selector) {
      return this.#findExt(selectorOrElt, selector);
    }
    findAll(selectorOrElt, selector) {
      return this.#findAllExt(selectorOrElt, selector);
    }
    parseInterval(str) {
      if (typeof str === "number")
        return str;
      let m = { ms: 1, s: 1000, m: 60000 };
      let [, n, u] = str?.match(/^([\d.]+)(ms|s|m)?$/) || [];
      let v = parseFloat(n) * (m[u] || 1);
      return isNaN(v) ? undefined : v;
    }
    trigger(on, eventName, detail = {}, bubbles = true) {
      on = this.#normalizeElement(on);
      let evt = new CustomEvent(eventName, {
        detail,
        cancelable: true,
        bubbles,
        composed: true
      });
      let target = on?.isConnected ? on : document;
      let result = !detail.cancelled && target.dispatchEvent(evt);
      return result;
    }
    ajax(verb, path, options) {
      if (!options || options instanceof Element || typeof options === "string") {
        options = { target: options };
      }
      let sourceElt = typeof options.source === "string" ? document.querySelector(options.source) : options.source;
      if (typeof options.source === "string" && !sourceElt) {
        return Promise.reject(new Error("Source not found"));
      }
      if (options.target) {
        let target = this.#resolveTarget(document.body, options.target);
        if (!target) {
          return Promise.reject(new Error("Target not found"));
        }
        sourceElt ||= target;
      }
      sourceElt ||= document.body;
      let ctx = this.#createRequestContext(sourceElt, options.event || {});
      Object.assign(ctx, options);
      if (options.target)
        ctx.target = this.#resolveTarget(document.body, options.target);
      Object.assign(ctx.request, { action: path, method: verb.toUpperCase() });
      if (options.headers)
        Object.assign(ctx.request.headers, options.headers);
      return this.#handleTriggerEvent(ctx);
    }
    #pushUrlIntoHistory(path) {
      if (!this.config.history)
        return;
      if (!history.state)
        history.replaceState({ htmx: true }, "", location.href);
      history.pushState({ htmx: true }, "", path);
      this.#trigger(document, "htmx:after:history:push", { path });
    }
    #replaceUrlInHistory(path) {
      if (!this.config.history)
        return;
      history.replaceState({ htmx: true }, "", path);
      this.#trigger(document, "htmx:after:history:replace", { path });
    }
    async#restoreHistory(state, path) {
      await this.timeout(1);
      state ??= history.state;
      if (!state?.htmx)
        return;
      this.#historyAbort?.abort();
      path = path || location.pathname + location.search;
      let historyElt = document.querySelector(this.#prefixSelector("[hx-history-elt]")) || document.body;
      if (this.#trigger(document, "htmx:before:history:restore", { path, cacheMiss: true })) {
        if (this.config.history === "reload") {
          this._loc.reload();
        } else {
          this.#historyAbort = new AbortController;
          return this.ajax("GET", path, {
            target: historyElt,
            swap: "outerSync",
            select: historyElt !== document.body ? this.#prefixSelector("[hx-history-elt]") : undefined,
            request: {
              headers: { "HX-History-Restore-Request": "true" },
              signal: this.#historyAbort.signal
            }
          });
        }
      }
    }
    #resolveHistoryAction(ctx) {
      let { sourceElement, push, replace, hx, response } = ctx;
      if (hx?.pushurl || hx?.replaceurl) {
        push = hx.pushurl;
        replace = hx.replaceurl;
      }
      if (push == null && replace == null && this.#isBoosted(sourceElement)) {
        push = "true";
      }
      if (push === "false" || push === false)
        push = null;
      if (replace === "false" || replace === false)
        replace = null;
      if (!push && !replace)
        return null;
      let path = push || replace;
      if (path === "true") {
        let finalUrl = response?.raw?.url || ctx.request.action;
        let url = new URL(finalUrl, location.href);
        path = url.pathname + url.search + (ctx.request.anchor ? "#" + ctx.request.anchor : "");
      }
      let type = push ? "push" : "replace";
      return { type, path };
    }
    #handleHistoryUpdate(ctx) {
      if (!this.config.history)
        return;
      let action = this.#resolveHistoryAction(ctx);
      if (!action)
        return;
      let historyDetail = {
        history: action,
        sourceElement: ctx.sourceElement,
        response: ctx.response
      };
      if (!this.#trigger(document, "htmx:before:history:update", historyDetail))
        return;
      if (action.type === "push") {
        this.#pushUrlIntoHistory(action.path);
      } else {
        this.#replaceUrlInHistory(action.path);
      }
      this.#trigger(document, "htmx:after:history:update", historyDetail);
    }
    #handleHxOnAttributes(node) {
      if (node._htmx?.onInitialized)
        return;
      let hxOnNames = this.#prefixes("hx-on");
      let mc = this.config.metaCharacter || ":";
      let handler = (code) => async (evt) => {
        try {
          await this.#executeJavaScript(node, { event: evt }, `with(event?.detail||{}){${code}}`, false);
        } catch (e) {
          if (typeof e !== "symbol")
            this.#trigger(node, "htmx:error", { error: e });
        }
      };
      for (let attr of node.getAttributeNames()) {
        let prefix = hxOnNames.find((p) => attr.startsWith(p));
        if (!prefix)
          continue;
        this.#htmxProp(node).onInitialized = true;
        let rest = attr.substring(prefix.length);
        let value = node.getAttribute(attr);
        if (!rest) {
          for (let part of value.split(/;(?=[^;]*->)/)) {
            let idx = part.indexOf("->");
            if (idx !== -1)
              this.#onTrigger(node, part.substring(0, idx).trim(), handler(part.substring(idx + 2).trim()));
          }
          continue;
        }
        if (rest[0] !== mc)
          continue;
        let eventName = rest.substring(1);
        if (eventName.startsWith(mc))
          eventName = "htmx" + mc + eventName.substring(1);
        this.#onTrigger(node, eventName, handler(value));
      }
    }
    #showIndicators(elt) {
      let hxIndicator = this.#attributeValue(elt, "hx-indicator");
      let indicatorElements;
      if (!hxIndicator) {
        if (elt === document.body)
          return [];
        indicatorElements = [elt];
      } else {
        indicatorElements = this.#findAllExt(elt, hxIndicator, "hx-indicator");
      }
      for (const indicator of indicatorElements) {
        let s = this.#htmxState(indicator);
        s.rc = (s.rc || 0) + 1;
        this.#addClass(indicator, this.config.requestClass);
      }
      return indicatorElements;
    }
    #hideIndicators(indicatorElements) {
      for (let indicator of indicatorElements) {
        let s = this.#htmxState(indicator);
        if (s.rc && --s.rc <= 0) {
          this.#removeClass(indicator, this.config.requestClass);
          delete s.rc;
        }
      }
    }
    #disableElements(elt) {
      let hxDisable = this.#attributeValue(elt, "hx-disable");
      let disabledElements = [];
      if (hxDisable) {
        disabledElements = this.#findAllExt(elt, hxDisable, "hx-disable");
        for (let indicator of disabledElements) {
          let s = this.#htmxState(indicator);
          s.dc = (s.dc || 0) + 1;
          indicator.disabled = true;
        }
      }
      return disabledElements;
    }
    #enableElements(disabledElements) {
      for (const indicator of disabledElements) {
        let s = this.#htmxState(indicator);
        if (s.dc && --s.dc <= 0) {
          indicator.disabled = false;
          delete s.dc;
        }
      }
    }
    #collectFormData(elt, form, submitter, validate, isGet) {
      if (validate && form && !form.reportValidity())
        return;
      let formData = form ? new FormData(form) : new FormData;
      let included = form ? new Set(form.elements) : new Set;
      if (!form) {
        if (validate && elt.reportValidity && !elt.reportValidity())
          return;
        this.#addInputValues(elt, included, formData, isGet);
      }
      if (submitter && submitter.name) {
        formData.append(submitter.name, submitter.value);
        included.add(submitter);
      }
      let hxInclude = this.#attributeValue(elt, "hx-include");
      if (hxInclude) {
        for (let node of this.#findAllExt(elt, hxInclude)) {
          if (validate && node.reportValidity && !node.reportValidity())
            return;
          this.#addInputValues(node, included, formData);
        }
      }
      return formData;
    }
    #addInputValues(elt, included, formData, isGet) {
      let tag = elt.tagName;
      let inputs = [];
      if (tag === "BUTTON" || tag.includes("-")) {
        inputs = [elt];
      } else if (["INPUT", "SELECT", "TEXTAREA", "FIELDSET"].includes(tag) || !isGet) {
        inputs = this.#queryEltAndDescendants(elt, "[name]:not(button)");
      }
      for (let input of inputs) {
        let name = input.name || input.getAttribute?.("name");
        if (!name || input.matches(":disabled") || included.has(input))
          continue;
        included.add(input);
        let type = input.type;
        if (type === "checkbox" || type === "radio" || input.tagName !== "INPUT" && "checked" in input) {
          if (input.checked) {
            formData.append(name, input.value);
          }
        } else if (type === "file") {
          for (let file of input.files) {
            formData.append(name, file);
          }
        } else if (type === "select-multiple") {
          for (let option of input.selectedOptions) {
            formData.append(name, option.value);
          }
        } else if (Array.isArray(input.value)) {
          for (let v of input.value) {
            formData.append(name, v);
          }
        } else {
          formData.append(name, input.value);
        }
      }
    }
    #getAttributeObject(elt, attrName, callback, scope = {}) {
      let hxAttr = this.#attributeValue(elt, attrName);
      if (!hxAttr)
        return null;
      let javascriptContent = this.#extractJavascriptContent(hxAttr);
      if (javascriptContent) {
        if (javascriptContent.indexOf("{") !== 0) {
          javascriptContent = "{" + javascriptContent + "}";
        }
        return this.#executeJavaScript(elt, scope, javascriptContent, true).then((obj) => {
          callback(obj);
        });
      } else {
        callback(HCON.parse(hxAttr));
      }
    }
    #stringHyperscriptStyleSelector(selector) {
      let s = selector.trim();
      return s.startsWith("<") && s.endsWith("/>") ? s.slice(1, -2) : s;
    }
    #findAllExt(eltOrSelector, maybeSelector, thisAttr, global) {
      let selector = maybeSelector ?? eltOrSelector;
      let elt = maybeSelector ? this.#normalizeElement(eltOrSelector) || document.body : document;
      if (selector.startsWith("global ")) {
        return this.#findAllExt(elt, selector.slice(7), thisAttr, true);
      }
      let parts = selector ? HCON.split(selector) : [];
      let result = [];
      let unprocessedParts = [];
      for (const part of parts) {
        let selector2 = this.#stringHyperscriptStyleSelector(part);
        let item;
        if (selector2.startsWith("closest ")) {
          item = elt.closest(selector2.slice(8));
        } else if (selector2.startsWith("find ")) {
          item = elt.querySelector(selector2.slice(5));
        } else if (selector2.startsWith("findAll ")) {
          result.push(...elt.querySelectorAll(selector2.slice(8)));
        } else if (selector2 === "next" || selector2 === "nextElementSibling") {
          item = elt.nextElementSibling;
        } else if (selector2.startsWith("next ")) {
          item = this.#scanForwardQuery(elt, selector2.slice(5), !!global);
        } else if (selector2 === "previous" || selector2 === "previousElementSibling") {
          item = elt.previousElementSibling;
        } else if (selector2.startsWith("previous ")) {
          item = this.#scanBackwardsQuery(elt, selector2.slice(9), !!global);
        } else if (selector2 === "document") {
          item = document;
        } else if (selector2 === "window") {
          item = window;
        } else if (selector2 === "body") {
          item = document.body;
        } else if (selector2 === "host") {
          item = elt.getRootNode().host;
        } else if (selector2 === "this") {
          if (thisAttr) {
            result.push(...this.#findThisElements(elt, thisAttr));
            continue;
          }
          item = elt;
        } else {
          unprocessedParts.push(selector2);
        }
        if (item) {
          result.push(item);
        }
      }
      if (unprocessedParts.length > 0) {
        let standardSelector = unprocessedParts.join(",");
        let rootNode = this.#getRootNode(elt, !!global);
        result.push(...rootNode.querySelectorAll(standardSelector));
      }
      return [...new Set(result)];
    }
    #scanForwardQuery(start, match, global) {
      return this.#scanUntilComparison(this.#getRootNode(start, global).querySelectorAll(match), start, Node.DOCUMENT_POSITION_PRECEDING);
    }
    #scanBackwardsQuery(start, match, global) {
      let results = [...this.#getRootNode(start, global).querySelectorAll(match)].reverse();
      return this.#scanUntilComparison(results, start, Node.DOCUMENT_POSITION_FOLLOWING);
    }
    #scanUntilComparison(results, start, comparison) {
      for (const elt of results) {
        if (elt.compareDocumentPosition(start) === comparison) {
          return elt;
        }
      }
    }
    #getRootNode(elt, global) {
      if (elt.isConnected && elt.getRootNode) {
        return elt.getRootNode?.({ composed: global });
      } else {
        return document;
      }
    }
    #findOrWarn(elt, selector, thisAttr) {
      let result = this.#findAllExt(elt, selector, thisAttr)[0];
      if (!result) {
        console.warn(`htmx: '${selector}' on ${thisAttr} did not match any element`, { elt, selector, attr: thisAttr });
      }
      return result;
    }
    #findExt(eltOrSelector, selector, thisAttr) {
      return this.#findAllExt(eltOrSelector, selector, thisAttr)[0];
    }
    #extractJavascriptContent(string) {
      if (string != null) {
        if (string.startsWith("js:")) {
          return string.substring(3);
        } else if (string.startsWith("javascript:")) {
          return string.substring(11);
        }
      }
    }
    #initializeAbortListener(elt) {
      let htmxProp = this.#htmxProp(elt);
      if (htmxProp.abortInitialized)
        return;
      htmxProp.abortInitialized = true;
      let handler = () => {
        let requestQueue = this.#getRequestQueue(elt);
        requestQueue.abort();
      };
      elt.addEventListener("htmx:abort", handler);
      htmxProp.listeners.push({ fromElt: elt, eventName: "htmx:abort", handler });
    }
    #morph(oldNode, fragment, innerHTML) {
      let { persistentIds, idMap } = this.#createIdMaps(oldNode, fragment);
      let pantry = document.createElement("div");
      pantry.hidden = true;
      document.body.after(pantry);
      let ctx = { target: oldNode, idMap, persistentIds, pantry, futureMatches: new WeakSet };
      if (innerHTML) {
        this.#morphChildren(ctx, oldNode, fragment);
      } else {
        this.#morphChildren(ctx, oldNode.parentNode, fragment, oldNode, oldNode.nextSibling);
      }
      this.#cleanup(pantry);
      pantry.remove();
    }
    #morphChildren(ctx, oldParent, newParent, insertionPoint = null, endPoint = null) {
      if (oldParent instanceof HTMLTemplateElement && newParent instanceof HTMLTemplateElement) {
        oldParent = oldParent.content;
        newParent = newParent.content;
      }
      insertionPoint ||= oldParent.firstChild;
      let newChild = newParent.firstChild;
      while (newChild) {
        let matchedNode;
        if (insertionPoint && insertionPoint != endPoint) {
          matchedNode = this.#findBestMatch(ctx, newChild, insertionPoint, endPoint);
          if (matchedNode) {
            if (matchedNode !== insertionPoint) {
              let cursor = insertionPoint;
              while (cursor && cursor !== matchedNode) {
                let tempNode = cursor;
                cursor = cursor.nextSibling;
                if (tempNode instanceof Element && (ctx.idMap.has(tempNode) || this.#matchesUpcomingSibling(ctx, tempNode, newChild))) {
                  this.#moveBefore(oldParent, tempNode, endPoint);
                } else {
                  this.#removeNode(ctx, tempNode);
                }
              }
            }
          }
        }
        if (!matchedNode && newChild instanceof Element && ctx.persistentIds.has(newChild.id)) {
          let escapedId = CSS.escape(newChild.id);
          matchedNode = ctx.target.id === newChild.id && ctx.target || ctx.target.querySelector(`[id="${escapedId}"]`) || ctx.pantry.querySelector(`[id="${escapedId}"]`);
          let element = matchedNode;
          while (element = element.parentNode) {
            let idSet = ctx.idMap.get(element);
            if (idSet) {
              idSet.delete(matchedNode.id);
              if (!idSet.size)
                ctx.idMap.delete(element);
            }
          }
          this.#moveBefore(oldParent, matchedNode, insertionPoint);
        }
        if (matchedNode) {
          this.#morphNode(matchedNode, newChild, ctx);
          insertionPoint = matchedNode.nextSibling;
          newChild = newChild.nextSibling;
          continue;
        }
        let nextNewChild = newChild.nextSibling;
        if (ctx.idMap.has(newChild)) {
          let placeholder = document.createElement(newChild.tagName);
          oldParent.insertBefore(placeholder, insertionPoint);
          this.#morphNode(placeholder, newChild, ctx);
          this.process(placeholder);
          insertionPoint = placeholder.nextSibling;
        } else {
          oldParent.insertBefore(newChild, insertionPoint);
          insertionPoint = newChild.nextSibling;
        }
        newChild = nextNewChild;
      }
      while (insertionPoint && insertionPoint != endPoint) {
        let tempNode = insertionPoint;
        insertionPoint = insertionPoint.nextSibling;
        this.#removeNode(ctx, tempNode);
      }
    }
    #matchesUpcomingSibling(ctx, oldElt, startNode) {
      if (ctx.futureMatches.has(oldElt))
        return true;
      for (let sibling = startNode.nextSibling, i = 0;sibling && i < this.config.morphScanLimit; sibling = sibling.nextSibling, i++) {
        if (sibling instanceof Element && oldElt.isEqualNode(sibling)) {
          ctx.futureMatches.add(oldElt);
          return true;
        }
      }
      return false;
    }
    #findBestMatch(ctx, node, startPoint, endPoint) {
      if (node.nodeType === 3)
        return startPoint?.nodeType === 3 ? startPoint : null;
      if (!(node instanceof Element))
        return null;
      let softMatch = null, displaceMatchCount = 0, scanLimit = this.config.morphScanLimit;
      let newSet = ctx.idMap.get(node), nodeMatchCount = newSet?.size || 0;
      if (node.id && !newSet)
        return null;
      let cursor = startPoint;
      while (cursor && cursor != endPoint) {
        let oldSet = ctx.idMap.get(cursor);
        if (this.#internalAPI.isSoftMatch(cursor, node)) {
          if (oldSet && newSet && [...oldSet].some((id) => newSet.has(id)))
            return cursor;
          if (!oldSet) {
            if (scanLimit > 0 && cursor.isEqualNode(node))
              return cursor;
            if (!softMatch)
              softMatch = cursor;
          }
        }
        displaceMatchCount += oldSet?.size || 0;
        if (displaceMatchCount > nodeMatchCount)
          break;
        if (document.activeElement?.selectionStart != null && cursor.contains(document.activeElement))
          break;
        if (--scanLimit < 1 && nodeMatchCount === 0)
          break;
        cursor = cursor.nextSibling;
      }
      if (softMatch && this.#matchesUpcomingSibling(ctx, softMatch, node))
        return null;
      return softMatch;
    }
    #isSoftMatch(oldNode, newNode) {
      if (!(oldNode instanceof Element) || oldNode.tagName !== newNode.tagName) {
        return false;
      }
      if (oldNode.tagName === "SCRIPT" && !oldNode.isEqualNode(newNode))
        return false;
      return !oldNode.id || oldNode.id === newNode.id;
    }
    #removeNode(ctx, node) {
      if (ctx.idMap.has(node)) {
        this.#moveBefore(ctx.pantry, node, null);
      } else {
        this.#cleanup(node);
        node.remove();
      }
    }
    #moveBefore(parentNode, element, after) {
      if (parentNode.moveBefore) {
        try {
          parentNode.moveBefore(element, after);
          return;
        } catch (e) {}
      }
      parentNode.insertBefore(element, after);
    }
    #morphNode(oldNode, newNode, ctx) {
      if (oldNode.nodeType === 3) {
        if (oldNode.nodeValue !== newNode.nodeValue)
          oldNode.nodeValue = newNode.nodeValue;
        return;
      }
      if (this.config.morphSkip && oldNode.matches?.(this.config.morphSkip))
        return;
      if (!this.#triggerExtensions(oldNode, "htmx:before:morph:node", { oldNode, newNode }))
        return;
      this.#copyAttributes(oldNode, newNode);
      if (oldNode instanceof HTMLTextAreaElement && document.activeElement !== oldNode && oldNode.defaultValue != newNode.defaultValue) {
        oldNode.value = newNode.value;
      }
      let skipChildren = this.config.morphSkipChildren && oldNode.matches?.(this.config.morphSkipChildren);
      if (!skipChildren && (!oldNode.isEqualNode(newNode) || newNode.tagName === "TEMPLATE" || newNode.querySelector?.("template"))) {
        this.#morphChildren(ctx, oldNode, newNode);
      }
    }
    #copyAttributes(destination, source) {
      let attributesToIgnore = this.config.morphIgnore || [];
      let needsReinit = false;
      let isHxAttr = (name) => this.#prefixes("hx-").some((p) => name.startsWith(p));
      for (const attr of source.attributes) {
        if (!attributesToIgnore.some((p) => attr.name.startsWith(p)) && destination.getAttribute(attr.name) !== attr.value) {
          if (isHxAttr(attr.name))
            needsReinit = true;
          if (!this.#triggerExtensions(destination, "htmx:before:morph:attr", { attrName: attr.name, newValue: attr.value }))
            continue;
          destination.setAttribute(attr.name, attr.value);
          if (attr.name === "value" && destination instanceof HTMLInputElement && destination.type !== "file" && document.activeElement !== destination) {
            destination.value = attr.value;
          }
        }
      }
      for (let i = destination.attributes.length - 1;i >= 0; i--) {
        let attr = destination.attributes[i];
        if (attr && !source.hasAttribute(attr.name) && !attributesToIgnore.some((p) => attr.name.startsWith(p))) {
          if (isHxAttr(attr.name))
            needsReinit = true;
          if (!this.#triggerExtensions(destination, "htmx:before:morph:attr", { attrName: attr.name, newValue: null }))
            continue;
          destination.removeAttribute(attr.name);
        }
      }
      if (needsReinit)
        this.#cleanup(destination, true);
    }
    #populateIdMapWithTree(idMap, persistentIds, root, elements) {
      for (const elt of elements) {
        if (persistentIds.has(elt.id)) {
          let current = elt;
          while (current && current !== root) {
            let idSet = idMap.get(current);
            if (idSet == null) {
              idSet = new Set;
              idMap.set(current, idSet);
            }
            idSet.add(elt.id);
            current = current.parentElement;
          }
        }
      }
    }
    #createIdMaps(oldNode, newContent) {
      let oldIdElements = this.#queryEltAndDescendants(oldNode, "[id]");
      let newIdElements = newContent.querySelectorAll("[id]");
      let persistentIds = this.#createPersistentIds(oldIdElements, newIdElements);
      let idMap = new Map;
      this.#populateIdMapWithTree(idMap, persistentIds, oldNode.parentElement, oldIdElements);
      this.#populateIdMapWithTree(idMap, persistentIds, newContent, newIdElements);
      return { persistentIds, idMap };
    }
    #createPersistentIds(oldIdElements, newIdElements) {
      let duplicateIds = new Set, oldIdTagNameMap = new Map;
      for (const { id, tagName } of oldIdElements) {
        if (oldIdTagNameMap.has(id))
          duplicateIds.add(id);
        else if (id)
          oldIdTagNameMap.set(id, tagName);
      }
      let persistentIds = new Set;
      for (const { id, tagName } of newIdElements) {
        if (persistentIds.has(id))
          duplicateIds.add(id);
        else if (oldIdTagNameMap.get(id) === tagName)
          persistentIds.add(id);
      }
      for (const id of duplicateIds)
        persistentIds.delete(id);
      return persistentIds;
    }
    #handleStatusCodes(ctx) {
      let status = ctx.response.raw.status;
      let noSwapStrings = this.config.noSwap.map((x) => x + "");
      let str = status + "";
      for (let pattern of [str, str.slice(0, 2) + "x", str[0] + "xx"]) {
        if (noSwapStrings.includes(pattern)) {
          ctx.swap = "none";
          return;
        }
        let statusValue = this.#attributeValue(ctx.sourceElement, "hx-status:" + pattern);
        if (statusValue) {
          HCON.merge(statusValue, ctx);
          return;
        }
      }
    }
    #submitTransitionTask(task, ctx) {
      return new Promise((resolve) => {
        this.#transitionQueue ||= [];
        this.#transitionQueue.push({ task, resolve, ctx });
        if (!this.#processingTransition) {
          this.#processTransitionQueue();
        }
      });
    }
    async#processTransitionQueue() {
      if (this.#transitionQueue.length === 0 || this.#processingTransition) {
        return;
      }
      this.#processingTransition = true;
      let { task, resolve, ctx } = this.#transitionQueue.shift();
      try {
        if (document.startViewTransition) {
          let detail = { task, ctx };
          this.#trigger(ctx.sourceElement, "htmx:before:viewTransition", detail);
          await document.startViewTransition(detail.task).finished;
          this.#trigger(ctx.sourceElement, "htmx:after:viewTransition", detail);
        } else {
          await task();
        }
      } catch (e) {} finally {
        this.#processingTransition = false;
        resolve();
        this.#processTransitionQueue();
      }
    }
    #startCSSTransitions(fragment, root) {
      let idElements = root.querySelectorAll("[id]");
      let existingElementsById = Object.fromEntries([...idElements].map((e) => [e.id, e]));
      let newElementsWithIds = fragment.querySelectorAll("[id]");
      let restoreTasks = [];
      for (let elt of newElementsWithIds) {
        let existing = existingElementsById[elt.id];
        if (existing?.tagName === elt.tagName) {
          let clone = elt.cloneNode(false);
          this.#copyAttributes(elt, existing);
          restoreTasks.push(() => {
            this.#copyAttributes(elt, clone);
          });
        }
      }
      return restoreTasks;
    }
    #addClass(elt, cls) {
      elt?.classList?.add?.(cls);
    }
    #removeClass(elt, cls) {
      elt?.classList?.remove?.(cls);
      if (elt?.classList?.length === 0)
        elt.removeAttribute("class");
    }
    #normalizeElement(cssOrElement) {
      if (typeof cssOrElement === "string") {
        return this.find(cssOrElement);
      } else {
        return cssOrElement;
      }
    }
    #maybeAdjustMetaCharacter(string) {
      if (this.config.metaCharacter) {
        return string.replace(/:/g, this.config.metaCharacter);
      } else {
        return string;
      }
    }
  }
  return new Htmx;
})();
if (typeof window !== "undefined")
  window.htmx = htmx2;

// node_modules/htmx.org/dist/ext/hx-alpine-compat.js
(() => {
  let api;
  let deferCount = 0;
  function maybeFlush() {
    if (deferCount > 0)
      deferCount--;
    if (deferCount === 0 && window.Alpine?.flushAndStopDeferringMutations) {
      window.Alpine.flushAndStopDeferringMutations();
    }
  }
  htmx.registerExtension("alpine-compat", {
    init: (internalAPI) => {
      api = internalAPI;
      let originalIsSoftMatch = api.isSoftMatch;
      api.isSoftMatch = function(oldNode, newNode) {
        if (oldNode._x_bindings?.id && newNode.matches?.("[\\:id], [x-bind\\:id]")) {
          return oldNode instanceof Element && oldNode.tagName === newNode.tagName;
        }
        return originalIsSoftMatch(oldNode, newNode);
      };
    },
    htmx_before_swap: (elt, detail) => {
      if (!window.Alpine?.closestDataStack || !window.Alpine?.cloneNode || !window.Alpine?.deferMutations) {
        return;
      }
      if (deferCount === 0) {
        window.Alpine.deferMutations();
      }
      deferCount++;
      let { tasks } = detail;
      for (let task of tasks) {
        if (task.swapSpec.style === "innerMorph" || task.swapSpec.style === "outerMorph") {
          if (!task.fragment || !task.target)
            continue;
          let target = typeof task.target === "string" ? document.querySelector(task.target) : task.target;
          if (!target)
            continue;
        }
      }
    },
    htmx_before_morph_node: (elt, detail) => {
      if (!window.Alpine?.closestDataStack || !window.Alpine?.cloneNode) {
        return;
      }
      let { oldNode, newNode } = detail;
      let oldDataStack = window.Alpine.closestDataStack(oldNode);
      newNode._x_dataStack = oldDataStack;
      if (!oldNode.isConnected)
        return;
      window.Alpine.cloneNode(oldNode, newNode);
      if (oldNode._x_teleport && newNode._x_teleport) {
        let fragment = document.createDocumentFragment();
        fragment.append(newNode._x_teleport);
        api.morph(oldNode._x_teleport, fragment, false);
      }
    },
    htmx_history_cache_before_save: (elt, detail) => {
      if (!window.Alpine?.destroyTree)
        return;
      detail.target.querySelectorAll("[x-data]").forEach((el) => {
        if (el._x_dataStack) {
          el.setAttribute("data-alpine-state", JSON.stringify(el._x_dataStack[0]));
        }
      });
      window.Alpine.destroyTree(detail.target);
    },
    htmx_history_cache_after_restore: (elt, detail) => {
      if (!window.Alpine)
        return;
      document.querySelectorAll("[data-alpine-state]").forEach((el) => {
        let saved = JSON.parse(el.getAttribute("data-alpine-state"));
        el.removeAttribute("data-alpine-state");
        if (el._x_dataStack) {
          for (let key in saved) {
            try {
              el._x_dataStack[0][key] = saved[key];
            } catch {}
          }
        }
      });
    },
    htmx_after_swap: (elt, detail) => {
      detail.ctx._alpineFlushed = true;
      maybeFlush();
    },
    htmx_finally_request: (elt, detail) => {
      if (!detail.ctx._alpineFlushed)
        maybeFlush();
    }
  });
})();

// node_modules/alpinejs/dist/module.esm.js
var flushPending = false;
var flushing = false;
var queue = [];
var lastFlushedIndex = -1;
var queueNeedsSort = false;
var transactionActive = false;
function scheduler(callback) {
  queueJob(callback);
}
function startTransaction() {
  transactionActive = true;
}
function commitTransaction() {
  transactionActive = false;
  queueFlush();
}
function queueJob(job) {
  if (!queue.includes(job)) {
    queue.push(job);
    if (job._x_schedulerPriority !== undefined)
      queueNeedsSort = true;
  }
  queueFlush();
}
function dequeueJob(job) {
  let index = queue.indexOf(job);
  if (index !== -1 && index > lastFlushedIndex)
    queue.splice(index, 1);
}
function queueFlush() {
  if (!flushing && !flushPending) {
    if (transactionActive)
      return;
    flushPending = true;
    queueMicrotask(flushJobs);
  }
}
function flushJobs() {
  flushPending = false;
  flushing = true;
  for (let i = 0;i < queue.length; i++) {
    if (queueNeedsSort)
      sortPendingJobs(i);
    queue[i]();
    lastFlushedIndex = i;
  }
  queue.length = 0;
  lastFlushedIndex = -1;
  queueNeedsSort = false;
  flushing = false;
}
function sortPendingJobs(start2) {
  let depths = /* @__PURE__ */ new Map;
  let sorted = queue.slice(start2).sort((a, b) => compareJobs(a, b, depths));
  for (let i = 0;i < sorted.length; i++) {
    queue[start2 + i] = sorted[i];
  }
  queueNeedsSort = false;
}
function compareJobs(a, b, depths) {
  if (!isStructural(a))
    return isStructural(b) ? 1 : 0;
  if (!isStructural(b))
    return -1;
  let depthDifference = getElementDepth(a._x_schedulerPriority.el, depths) - getElementDepth(b._x_schedulerPriority.el, depths);
  return depthDifference || a._x_schedulerPriority.order - b._x_schedulerPriority.order;
}
function isStructural(job) {
  return job._x_schedulerPriority !== undefined;
}
function getElementDepth(el, depths) {
  if (depths.has(el))
    return depths.get(el);
  let depth = 0;
  let owner = el;
  while (el) {
    depth++;
    if (el._x_teleportBack) {
      el = el._x_teleportBack;
    } else if (typeof ShadowRoot === "function" && el.parentNode instanceof ShadowRoot) {
      el = el.parentNode.host;
    } else {
      el = el.parentElement;
    }
  }
  depths.set(owner, depth);
  return depth;
}
var reactive;
var effect;
var release;
var raw;
var nextStructuralEffectOrder = 0;
var shouldSchedule = true;
function disableEffectScheduling(callback) {
  shouldSchedule = false;
  callback();
  shouldSchedule = true;
}
function setReactivityEngine(engine) {
  reactive = engine.reactive;
  release = engine.release;
  effect = (callback) => engine.effect(callback, { scheduler: (task) => {
    if (shouldSchedule) {
      scheduler(task);
    } else {
      task();
    }
  } });
  raw = engine.raw;
}
function overrideEffect(override) {
  effect = override;
}
function elementBoundEffect(el) {
  let cleanup = () => {};
  let wrappedEffect = (callback, options) => {
    let priority = options?.priority === "structural" ? nextStructuralEffectOrder++ : undefined;
    let effectReference = effect(callback);
    if (priority !== undefined && effectReference !== undefined) {
      effectReference._x_schedulerPriority = { el, order: priority };
    }
    if (!el._x_effects) {
      el._x_effects = /* @__PURE__ */ new Set;
      el._x_runEffects = () => {
        el._x_effects.forEach((i) => i());
      };
    }
    el._x_effects.add(effectReference);
    cleanup = () => {
      if (effectReference === undefined)
        return;
      el._x_effects.delete(effectReference);
      release(effectReference);
    };
    return effectReference;
  };
  return [wrappedEffect, () => {
    cleanup();
  }];
}
function watch(getter, callback) {
  let firstTime = true;
  let oldValue;
  let oldValueJSON;
  let effectReference = effect(() => {
    let value = getter();
    let newJSON = JSON.stringify(value);
    if (!firstTime) {
      if (typeof value === "object" || value !== oldValue) {
        let previousValue = typeof oldValue === "object" ? JSON.parse(oldValueJSON) : oldValue;
        queueMicrotask(() => {
          callback(value, previousValue);
        });
      }
    }
    oldValue = value;
    oldValueJSON = newJSON;
    firstTime = false;
  });
  return () => release(effectReference);
}
async function transaction(callback) {
  startTransaction();
  try {
    await callback();
    await Promise.resolve();
  } finally {
    commitTransaction();
  }
}
var onAttributeAddeds = [];
var onElRemoveds = [];
var onElAddeds = [];
function onElAdded(callback) {
  onElAddeds.push(callback);
}
function onElRemoved(el, callback) {
  if (typeof callback === "function") {
    if (!el._x_cleanups)
      el._x_cleanups = [];
    el._x_cleanups.push(callback);
  } else {
    callback = el;
    onElRemoveds.push(callback);
  }
}
function onAttributesAdded(callback) {
  onAttributeAddeds.push(callback);
}
function onAttributeRemoved(el, name, callback) {
  if (!el._x_attributeCleanups)
    el._x_attributeCleanups = {};
  if (!el._x_attributeCleanups[name])
    el._x_attributeCleanups[name] = [];
  el._x_attributeCleanups[name].push(callback);
}
function cleanupAttributes(el, names) {
  if (!el._x_attributeCleanups)
    return;
  Object.entries(el._x_attributeCleanups).forEach(([name, value]) => {
    if (names === undefined || names.includes(name)) {
      value.forEach((i) => i());
      delete el._x_attributeCleanups[name];
    }
  });
}
function cleanupElement(el) {
  el._x_effects?.forEach(dequeueJob);
  while (el._x_cleanups?.length)
    el._x_cleanups.pop()();
}
var observer = new MutationObserver(onMutate);
var currentlyObserving = false;
function startObservingMutations() {
  observer.observe(document, { subtree: true, childList: true, attributes: true, attributeOldValue: true });
  currentlyObserving = true;
}
function stopObservingMutations() {
  flushObserver();
  observer.disconnect();
  currentlyObserving = false;
}
var queuedMutations = [];
function flushObserver() {
  let records = observer.takeRecords();
  queuedMutations.push(() => records.length > 0 && onMutate(records));
  let queueLengthWhenTriggered = queuedMutations.length;
  queueMicrotask(() => {
    if (queuedMutations.length === queueLengthWhenTriggered) {
      while (queuedMutations.length > 0)
        queuedMutations.shift()();
    }
  });
}
function flushPendingMutations() {
  while (queuedMutations.length > 0)
    queuedMutations.shift()();
  let records = observer.takeRecords();
  if (records.length > 0)
    onMutate(records);
}
function mutateDom(callback) {
  if (!currentlyObserving)
    return callback();
  stopObservingMutations();
  let result = callback();
  startObservingMutations();
  return result;
}
var isCollecting = false;
var deferredMutations = [];
function deferMutations() {
  isCollecting = true;
}
function flushAndStopDeferringMutations() {
  isCollecting = false;
  onMutate(deferredMutations);
  deferredMutations = [];
}
function onMutate(mutations) {
  if (isCollecting) {
    deferredMutations = deferredMutations.concat(mutations);
    return;
  }
  let addedNodes = [];
  let removedNodes = /* @__PURE__ */ new Set;
  let addedAttributes = /* @__PURE__ */ new Map;
  let removedAttributes = /* @__PURE__ */ new Map;
  for (let i = 0;i < mutations.length; i++) {
    if (mutations[i].target._x_ignoreMutationObserver)
      continue;
    if (mutations[i].type === "childList") {
      mutations[i].removedNodes.forEach((node) => {
        if (node.nodeType !== 1)
          return;
        if (!node._x_marker)
          return;
        removedNodes.add(node);
      });
      mutations[i].addedNodes.forEach((node) => {
        if (node.nodeType !== 1)
          return;
        if (removedNodes.has(node)) {
          removedNodes.delete(node);
          return;
        }
        if (node._x_marker)
          return;
        addedNodes.push(node);
      });
    }
    if (mutations[i].type === "attributes") {
      let el = mutations[i].target;
      let name = mutations[i].attributeName;
      let oldValue = mutations[i].oldValue;
      let add = () => {
        if (!addedAttributes.has(el))
          addedAttributes.set(el, []);
        addedAttributes.get(el).push({ name, value: el.getAttribute(name) });
      };
      let remove2 = () => {
        if (!removedAttributes.has(el))
          removedAttributes.set(el, []);
        removedAttributes.get(el).push(name);
      };
      if (el.hasAttribute(name) && oldValue === null) {
        add();
      } else if (el.hasAttribute(name)) {
        remove2();
        add();
      } else {
        remove2();
      }
    }
  }
  removedAttributes.forEach((attrs, el) => {
    cleanupAttributes(el, attrs);
  });
  addedAttributes.forEach((attrs, el) => {
    onAttributeAddeds.forEach((i) => i(el, attrs));
  });
  for (let node of removedNodes) {
    if (addedNodes.some((i) => i.contains(node)))
      continue;
    onElRemoveds.forEach((i) => i(node));
  }
  for (let node of addedNodes) {
    if (!node.isConnected)
      continue;
    onElAddeds.forEach((i) => i(node));
  }
  addedNodes = null;
  removedNodes = null;
  addedAttributes = null;
  removedAttributes = null;
}
function scope(node) {
  return mergeProxies(closestDataStack(node));
}
function addScopeToNode(node, data2, referenceNode) {
  node._x_dataStack = [data2, ...closestDataStack(referenceNode || node)];
  return () => {
    node._x_dataStack = node._x_dataStack.filter((i) => i !== data2);
  };
}
function closestDataStack(node) {
  if (node._x_dataStack)
    return node._x_dataStack;
  if (typeof ShadowRoot === "function" && node instanceof ShadowRoot) {
    return closestDataStack(node.host);
  }
  if (!node.parentNode) {
    return [];
  }
  return closestDataStack(node.parentNode);
}
function mergeProxies(objects) {
  return new Proxy({ objects }, mergeProxyTrap);
}
function keyInPrototypeChain(obj, key) {
  if (obj === null || obj === Object.prototype)
    return null;
  if (Object.prototype.hasOwnProperty.call(obj, key))
    return obj;
  return keyInPrototypeChain(Object.getPrototypeOf(obj), key);
}
var mergeProxyTrap = {
  ownKeys({ objects }) {
    return Array.from(new Set(objects.flatMap((i) => Object.keys(i))));
  },
  has({ objects }, name) {
    if (name == Symbol.unscopables)
      return false;
    return objects.some((obj) => Object.prototype.hasOwnProperty.call(obj, name) || Reflect.has(obj, name));
  },
  get({ objects }, name, thisProxy) {
    if (name == "toJSON")
      return collapseProxies;
    return Reflect.get(objects.find((obj) => Reflect.has(obj, name)) || {}, name, thisProxy);
  },
  set({ objects }, name, value, thisProxy) {
    let target;
    for (const obj of objects) {
      target = keyInPrototypeChain(obj, name);
      if (target)
        break;
    }
    if (!target)
      target = objects[objects.length - 1];
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    if (descriptor?.set && descriptor?.get)
      return descriptor.set.call(thisProxy, value) || true;
    return Reflect.set(target, name, value);
  }
};
function collapseProxies() {
  let keys = Reflect.ownKeys(this);
  return keys.reduce((acc, key) => {
    acc[key] = Reflect.get(this, key);
    return acc;
  }, {});
}
function initInterceptors(data2, cleanup = () => {}) {
  let isObject3 = (val) => typeof val === "object" && !Array.isArray(val) && val !== null;
  let recurse = (obj, basePath = "") => {
    Object.entries(Object.getOwnPropertyDescriptors(obj)).forEach(([key, { value, enumerable }]) => {
      if (enumerable === false || value === undefined)
        return;
      if (typeof value === "object" && value !== null && value.__v_skip)
        return;
      let path = basePath === "" ? key : `${basePath}.${key}`;
      if (typeof value === "object" && value !== null && value._x_interceptor) {
        obj[key] = value.initialize(data2, path, key, cleanup);
      } else {
        if (isObject3(value) && value !== obj && !(value instanceof Element)) {
          recurse(value, path);
        }
      }
    });
  };
  return recurse(data2);
}
function interceptor(callback, mutateObj = () => {}) {
  let obj = {
    initialValue: undefined,
    _x_interceptor: true,
    initialize(data2, path, key, cleanup) {
      return callback(this.initialValue, () => get(data2, path), (value) => set(data2, path, value), path, key, cleanup);
    }
  };
  mutateObj(obj);
  return (initialValue) => {
    if (typeof initialValue === "object" && initialValue !== null && initialValue._x_interceptor) {
      let initialize = obj.initialize.bind(obj);
      obj.initialize = (data2, path, key, cleanup) => {
        let innerValue = initialValue.initialize(data2, path, key, cleanup);
        obj.initialValue = innerValue;
        return initialize(data2, path, key, cleanup);
      };
    } else {
      obj.initialValue = initialValue;
    }
    return obj;
  };
}
function get(obj, path) {
  return path.split(".").reduce((carry, segment) => carry[segment], obj);
}
function set(obj, path, value) {
  if (typeof path === "string")
    path = path.split(".");
  if (path.length === 1)
    obj[path[0]] = value;
  else if (path.length === 0)
    throw error;
  else {
    if (obj[path[0]])
      return set(obj[path[0]], path.slice(1), value);
    else {
      obj[path[0]] = {};
      return set(obj[path[0]], path.slice(1), value);
    }
  }
}
var magics = {};
function magic(name, callback) {
  magics[name] = callback;
}
function injectMagics(obj, el) {
  let memoizedUtilities = getUtilities(el);
  Object.entries(magics).forEach(([name, callback]) => {
    Object.defineProperty(obj, `$${name}`, {
      get() {
        return callback(el, memoizedUtilities);
      },
      enumerable: false
    });
  });
  return obj;
}
function getUtilities(el) {
  let [utilities, cleanup] = getElementBoundUtilities(el);
  let utils = { interceptor, ...utilities };
  onElRemoved(el, cleanup);
  return utils;
}
function tryCatch(el, expression, callback, ...args) {
  try {
    return callback(...args);
  } catch (e) {
    handleError(e, el, expression);
  }
}
function handleError(...args) {
  return errorHandler(...args);
}
var errorHandler = normalErrorHandler;
function setErrorHandler(handler4) {
  errorHandler = handler4;
}
function normalErrorHandler(error2, el, expression = undefined) {
  error2 = Object.assign(error2 ?? { message: "No error message given." }, { el, expression });
  console.warn(`Alpine Expression Error: ${error2.message}

${expression ? 'Expression: "' + expression + `"

` : ""}`, el);
  setTimeout(() => {
    throw error2;
  }, 0);
}
var shouldAutoEvaluateFunctions = true;
function dontAutoEvaluateFunctions(callback) {
  let cache = shouldAutoEvaluateFunctions;
  shouldAutoEvaluateFunctions = false;
  let result = callback();
  shouldAutoEvaluateFunctions = cache;
  return result;
}
function evaluate(el, expression, extras = {}) {
  let result;
  evaluateLater(el, expression)((value) => result = value, extras);
  return result;
}
function evaluateLater(...args) {
  return theEvaluatorFunction(...args);
}
var theEvaluatorFunction = () => {};
function setEvaluator(newEvaluator) {
  theEvaluatorFunction = newEvaluator;
}
var theRawEvaluatorFunction;
function setRawEvaluator(newEvaluator) {
  theRawEvaluatorFunction = newEvaluator;
}
function normalEvaluator(el, expression) {
  let overriddenMagics = {};
  injectMagics(overriddenMagics, el);
  let dataStack = [overriddenMagics, ...closestDataStack(el)];
  let evaluator = typeof expression === "function" ? generateEvaluatorFromFunction(dataStack, expression) : generateEvaluatorFromString(dataStack, expression, el);
  return tryCatch.bind(null, el, expression, evaluator);
}
function generateEvaluatorFromFunction(dataStack, func) {
  return (receiver = () => {}, { scope: scope2 = {}, params = [], context } = {}) => {
    if (!shouldAutoEvaluateFunctions) {
      runIfTypeOfFunction(receiver, func, mergeProxies([scope2, ...dataStack]), params);
      return;
    }
    let result = func.apply(mergeProxies([scope2, ...dataStack]), params);
    runIfTypeOfFunction(receiver, result);
  };
}
var evaluatorMemo = {};
function generateFunctionFromString(expression, el) {
  if (evaluatorMemo[expression]) {
    return evaluatorMemo[expression];
  }
  let AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
  let rightSideSafeExpression = /^[\n\s]*if.*\(.*\)/.test(expression.trim()) || /^(let|const)\s/.test(expression.trim()) ? `(async()=>{ ${expression} })()` : expression;
  const safeAsyncFunction = () => {
    try {
      let func2 = new AsyncFunction(["__self", "scope"], `with (scope) { __self.result = ${rightSideSafeExpression} }; __self.finished = true; return __self.result;`);
      Object.defineProperty(func2, "name", {
        value: `[Alpine] ${expression}`
      });
      return func2;
    } catch (error2) {
      handleError(error2, el, expression);
      return Promise.resolve();
    }
  };
  let func = safeAsyncFunction();
  evaluatorMemo[expression] = func;
  return func;
}
function generateEvaluatorFromString(dataStack, expression, el) {
  let func = generateFunctionFromString(expression, el);
  return (receiver = () => {}, { scope: scope2 = {}, params = [], context } = {}) => {
    func.result = undefined;
    func.finished = false;
    let completeScope = mergeProxies([scope2, ...dataStack]);
    if (typeof func === "function") {
      let promise = func.call(context, func, completeScope).catch((error2) => handleError(error2, el, expression));
      if (func.finished) {
        runIfTypeOfFunction(receiver, func.result, completeScope, params, el);
        func.result = undefined;
      } else {
        promise.then((result) => {
          runIfTypeOfFunction(receiver, result, completeScope, params, el);
        }).catch((error2) => handleError(error2, el, expression)).finally(() => func.result = undefined);
      }
    }
  };
}
function runIfTypeOfFunction(receiver, value, scope2, params, el) {
  if (shouldAutoEvaluateFunctions && typeof value === "function") {
    let result = value.apply(scope2, params);
    if (result instanceof Promise) {
      result.then((i) => runIfTypeOfFunction(receiver, i, scope2, params)).catch((error2) => handleError(error2, el, value));
    } else {
      receiver(result);
    }
  } else if (typeof value === "object" && value instanceof Promise) {
    value.then((i) => receiver(i));
  } else {
    receiver(value);
  }
}
function evaluateRaw(...args) {
  return theRawEvaluatorFunction(...args);
}
function normalRawEvaluator(el, expression, extras = {}) {
  let overriddenMagics = {};
  injectMagics(overriddenMagics, el);
  let dataStack = [overriddenMagics, ...closestDataStack(el)];
  let scope2 = mergeProxies([extras.scope ?? {}, ...dataStack]);
  let params = extras.params ?? [];
  if (expression.includes("await")) {
    let AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
    let rightSideSafeExpression = /^[\n\s]*if.*\(.*\)/.test(expression.trim()) || /^(let|const)\s/.test(expression.trim()) ? `(async()=>{ ${expression} })()` : expression;
    let func = new AsyncFunction(["scope"], `with (scope) { let __result = ${rightSideSafeExpression}; return __result }`);
    let result = func.call(extras.context, scope2);
    return result;
  } else {
    let rightSideSafeExpression = /^[\n\s]*if.*\(.*\)/.test(expression.trim()) || /^(let|const)\s/.test(expression.trim()) ? `(()=>{ ${expression} })()` : expression;
    let func = new Function(["scope"], `with (scope) { let __result = ${rightSideSafeExpression}; return __result }`);
    let result = func.call(extras.context, scope2);
    if (typeof result === "function" && shouldAutoEvaluateFunctions) {
      return result.apply(scope2, params);
    }
    return result;
  }
}
var prefixAsString = "x-";
function prefix(subject = "") {
  return prefixAsString + subject;
}
function setPrefix(newPrefix) {
  prefixAsString = newPrefix;
}
var directiveHandlers = {};
function directive(name, callback) {
  directiveHandlers[name] = callback;
  return {
    before(directive2) {
      if (!directiveHandlers[directive2]) {
        console.warn(String.raw`Cannot find directive \`${directive2}\`. \`${name}\` will use the default order of execution`);
        return;
      }
      const pos = directiveOrder.indexOf(directive2);
      directiveOrder.splice(pos >= 0 ? pos : directiveOrder.indexOf("DEFAULT"), 0, name);
    }
  };
}
function directiveExists(name) {
  return Object.keys(directiveHandlers).includes(name);
}
function directives(el, attributes, originalAttributeOverride) {
  attributes = Array.from(attributes);
  if (el._x_virtualDirectives) {
    let vAttributes = Object.entries(el._x_virtualDirectives).map(([name, value]) => ({ name, value }));
    let staticAttributes = attributesOnly(vAttributes);
    vAttributes = vAttributes.map((attribute) => {
      if (staticAttributes.find((attr) => attr.name === attribute.name)) {
        return {
          name: `x-bind:${attribute.name}`,
          value: `"${attribute.value}"`
        };
      }
      return attribute;
    });
    attributes = attributes.concat(vAttributes);
  }
  let transformedAttributeMap = {};
  let directives2 = attributes.map(toTransformedAttributes((newName, oldName) => transformedAttributeMap[newName] = oldName)).filter(outNonAlpineAttributes).map(toParsedDirectives(transformedAttributeMap, originalAttributeOverride)).sort(byPriority);
  return directives2.map((directive2) => {
    return getDirectiveHandler(el, directive2);
  });
}
function attributesOnly(attributes) {
  return Array.from(attributes).map(toTransformedAttributes()).filter((attr) => !outNonAlpineAttributes(attr));
}
var isDeferringHandlers = false;
var directiveHandlerStacks = /* @__PURE__ */ new Map;
var currentHandlerStackKey = Symbol();
function deferHandlingDirectives(callback) {
  isDeferringHandlers = true;
  let key = Symbol();
  currentHandlerStackKey = key;
  directiveHandlerStacks.set(key, []);
  let flushHandlers = () => {
    while (directiveHandlerStacks.get(key).length)
      directiveHandlerStacks.get(key).shift()();
    directiveHandlerStacks.delete(key);
  };
  let stopDeferring = () => {
    isDeferringHandlers = false;
    flushHandlers();
  };
  callback(flushHandlers);
  stopDeferring();
}
function getElementBoundUtilities(el) {
  let cleanups = [];
  let cleanup = (callback) => cleanups.push(callback);
  let [effect3, cleanupEffect2] = elementBoundEffect(el);
  cleanups.push(cleanupEffect2);
  let utilities = {
    Alpine: alpine_default,
    effect: effect3,
    cleanup,
    evaluateLater: evaluateLater.bind(evaluateLater, el),
    evaluate: evaluate.bind(evaluate, el)
  };
  let doCleanup = () => cleanups.forEach((i) => i());
  return [utilities, doCleanup];
}
function getDirectiveHandler(el, directive2) {
  let noop = () => {};
  let handler4 = directiveHandlers[directive2.type] || noop;
  let [utilities, cleanup] = getElementBoundUtilities(el);
  onAttributeRemoved(el, directive2.original, cleanup);
  let fullHandler = () => {
    if (el._x_ignore || el._x_ignoreSelf)
      return;
    handler4.inline && handler4.inline(el, directive2, utilities);
    handler4 = handler4.bind(handler4, el, directive2, utilities);
    isDeferringHandlers ? directiveHandlerStacks.get(currentHandlerStackKey).push(handler4) : handler4();
  };
  fullHandler.runCleanups = cleanup;
  return fullHandler;
}
var startingWith = (subject, replacement) => ({ name, value }) => {
  if (name.startsWith(subject))
    name = name.replace(subject, replacement);
  return { name, value };
};
var into = (i) => i;
function toTransformedAttributes(callback = () => {}) {
  return ({ name, value }) => {
    let { name: newName, value: newValue } = attributeTransformers.reduce((carry, transform) => {
      return transform(carry);
    }, { name, value });
    if (newName !== name)
      callback(newName, name);
    return { name: newName, value: newValue };
  };
}
var attributeTransformers = [];
function mapAttributes(callback) {
  attributeTransformers.push(callback);
}
function outNonAlpineAttributes({ name }) {
  return alpineAttributeRegex().test(name);
}
var alpineAttributeRegex = () => new RegExp(`^${prefixAsString}([^:^.]+)\\b`);
function toParsedDirectives(transformedAttributeMap, originalAttributeOverride) {
  return ({ name, value }) => {
    if (name === value)
      value = "";
    let typeMatch = name.match(alpineAttributeRegex());
    let valueMatch = name.match(/:([a-zA-Z0-9\-_:]+)/);
    let modifiers = name.match(/\.[^.\]]+(?=[^\]]*$)/g) || [];
    let original = originalAttributeOverride || transformedAttributeMap[name] || name;
    return {
      type: typeMatch ? typeMatch[1] : null,
      value: valueMatch ? valueMatch[1] : null,
      modifiers: modifiers.map((i) => i.replace(".", "")),
      expression: value,
      original
    };
  };
}
var DEFAULT = "DEFAULT";
var directiveOrder = [
  "ignore",
  "ref",
  "id",
  "data",
  "anchor",
  "bind",
  "init",
  "for",
  "model",
  "modelable",
  "transition",
  "show",
  "if",
  DEFAULT,
  "teleport"
];
function byPriority(a, b) {
  let typeA = directiveOrder.indexOf(a.type) === -1 ? DEFAULT : a.type;
  let typeB = directiveOrder.indexOf(b.type) === -1 ? DEFAULT : b.type;
  return directiveOrder.indexOf(typeA) - directiveOrder.indexOf(typeB);
}
function walk(el, callback) {
  if (typeof ShadowRoot === "function" && el instanceof ShadowRoot) {
    Array.from(el.children).forEach((el2) => walk(el2, callback));
    return;
  }
  let skip = false;
  callback(el, () => skip = true);
  if (skip)
    return;
  let node = el.firstElementChild;
  while (node) {
    walk(node, callback, false);
    node = node.nextElementSibling;
  }
}
var isCloning = false;
function skipDuringClone(callback, fallback = () => {}) {
  return (...args) => isCloning ? fallback(...args) : callback(...args);
}
function onlyDuringClone(callback) {
  return (...args) => isCloning && callback(...args);
}
var interceptors = [];
function interceptClone(callback) {
  interceptors.push(callback);
}
function cloneNode(from, to) {
  interceptors.forEach((i) => i(from, to));
  isCloning = true;
  dontRegisterReactiveSideEffects(() => {
    initTree(to, (el, callback) => {
      callback(el, () => {});
    });
  });
  isCloning = false;
}
var isCloningLegacy = false;
function clone(oldEl, newEl) {
  if (!newEl._x_dataStack)
    newEl._x_dataStack = oldEl._x_dataStack;
  isCloning = true;
  isCloningLegacy = true;
  dontRegisterReactiveSideEffects(() => {
    cloneTree(newEl);
  });
  isCloning = false;
  isCloningLegacy = false;
}
function cloneTree(el) {
  let hasRunThroughFirstEl = false;
  let shallowWalker = (el2, callback) => {
    walk(el2, (el3, skip) => {
      if (hasRunThroughFirstEl && isRoot(el3))
        return skip();
      hasRunThroughFirstEl = true;
      callback(el3, skip);
    });
  };
  initTree(el, shallowWalker);
}
function dontRegisterReactiveSideEffects(callback) {
  let cache = effect;
  overrideEffect((callback2, el) => {
    let storedEffect = cache(callback2);
    release(storedEffect);
    return () => {};
  });
  callback();
  overrideEffect(cache);
}
var activeDefers = 0;
function deferInit(el, promise) {
  let record = el._x_deferInit;
  if (!record) {
    record = el._x_deferInit = {
      pending: 0,
      ownsIgnore: !el._x_ignore,
      queuedAttributes: /* @__PURE__ */ new Map
    };
    if (record.ownsIgnore)
      el._x_ignore = true;
    activeDefers++;
  }
  record.pending++;
  Promise.resolve(promise).catch((error2) => {
    try {
      handleError(error2, el);
    } catch (error3) {
      setTimeout(() => {
        throw error3;
      }, 0);
    }
  }).then(() => settle(el, record));
}
function settle(el, record) {
  record.pending--;
  if (record.pending > 0)
    return;
  flushPendingMutations();
  if (record.pending > 0)
    return;
  if (el._x_deferInit !== record)
    return;
  delete el._x_deferInit;
  if (record.ownsIgnore)
    delete el._x_ignore;
  activeDefers--;
  if (!el.isConnected)
    return;
  replayQueuedAttributes(record);
  initTree(el);
}
function queueAttributesForDeferredTree(el, attrs) {
  if (activeDefers === 0)
    return false;
  let root = findClosest(el, (i) => i._x_deferInit);
  if (!root)
    return false;
  queueInto(root._x_deferInit, el, attrs.map(({ name }) => name));
  return true;
}
function queueInto(record, el, names) {
  let entry = record.queuedAttributes.get(el);
  if (!entry || entry.marker !== el._x_marker) {
    entry = { marker: el._x_marker, names: /* @__PURE__ */ new Set };
    record.queuedAttributes.set(el, entry);
  }
  names.forEach((name) => entry.names.add(name));
}
function replayQueuedAttributes(record) {
  record.queuedAttributes.forEach((entry, el) => {
    if (!el.isConnected)
      return;
    if (!el._x_marker)
      return;
    if (el._x_marker !== entry.marker)
      return;
    let suspendedAncestor = findClosest(el, (i) => i._x_deferInit);
    if (suspendedAncestor) {
      queueInto(suspendedAncestor._x_deferInit, el, Array.from(entry.names));
      return;
    }
    let attrs = Array.from(entry.names).filter((name) => el.hasAttribute(name)).map((name) => ({ name, value: el.getAttribute(name) }));
    if (attrs.length === 0)
      return;
    directives(el, attrs).forEach((handle) => handle());
  });
}
interceptClone((from, to) => {
  if (activeDefers === 0)
    return;
  if (!from || from.nodeType !== 1 || !to || to.nodeType !== 1)
    return;
  if (findClosest(from, (i) => i._x_deferInit))
    to._x_ignore = true;
});
function dispatch(el, name, detail = {}, options = {}) {
  return el.dispatchEvent(new CustomEvent(name, {
    detail,
    bubbles: true,
    composed: true,
    cancelable: true,
    ...options
  }));
}
function warn(message, ...args) {
  console.warn(`Alpine Warning: ${message}`, ...args);
}
var started = false;
function start() {
  if (started)
    warn("Alpine has already been initialized on this page. Calling Alpine.start() more than once can cause problems.");
  started = true;
  if (!document.body)
    warn("Unable to initialize. Trying to load Alpine before `<body>` is available. Did you forget to add `defer` in Alpine's `<script>` tag?");
  dispatch(document, "alpine:init");
  dispatch(document, "alpine:initializing");
  startObservingMutations();
  onElAdded((el) => initTree(el, walk));
  onElRemoved((el) => destroyTree(el));
  onAttributesAdded((el, attrs) => {
    if (queueAttributesForDeferredTree(el, attrs))
      return;
    directives(el, attrs).forEach((handle) => handle());
  });
  let outNestedComponents = (el) => !closestRoot(el.parentElement, true);
  Array.from(document.querySelectorAll(allSelectors().join(","))).filter(outNestedComponents).forEach((el) => {
    initTree(el);
  });
  dispatch(document, "alpine:initialized");
  setTimeout(() => {
    warnAboutMissingPlugins();
  });
}
var rootSelectorCallbacks = [];
var initSelectorCallbacks = [];
function rootSelectors() {
  return rootSelectorCallbacks.map((fn) => fn());
}
function allSelectors() {
  return rootSelectorCallbacks.concat(initSelectorCallbacks).map((fn) => fn());
}
function addRootSelector(selectorCallback) {
  rootSelectorCallbacks.push(selectorCallback);
}
function addInitSelector(selectorCallback) {
  initSelectorCallbacks.push(selectorCallback);
}
function closestRoot(el, includeInitSelectors = false) {
  return findClosest(el, (element) => {
    const selectors = includeInitSelectors ? allSelectors() : rootSelectors();
    if (selectors.some((selector) => element.matches(selector)))
      return true;
  });
}
function findClosest(el, callback) {
  if (!el)
    return;
  if (callback(el))
    return el;
  if (el._x_teleportBack)
    return findClosest(el._x_teleportBack, callback);
  if (el.parentNode instanceof ShadowRoot) {
    return findClosest(el.parentNode.host, callback);
  }
  if (!el.parentElement)
    return;
  return findClosest(el.parentElement, callback);
}
function isRoot(el) {
  return rootSelectors().some((selector) => el.matches(selector));
}
var initInterceptors2 = [];
function interceptInit(callback) {
  initInterceptors2.push(callback);
}
var markerDispenser = 1;
function initTree(el, walker = walk, intercept = () => {}) {
  if (findClosest(el, (i) => i._x_ignore))
    return;
  deferHandlingDirectives(() => {
    walker(el, (el2, skip) => {
      if (el2._x_marker)
        return;
      intercept(el2, skip);
      initInterceptors2.forEach((i) => i(el2, skip));
      directives(el2, el2.attributes).forEach((handle) => handle());
      if (!el2._x_ignore)
        el2._x_marker = markerDispenser++;
      el2._x_ignore && skip();
    });
  });
}
function destroyTree(root, walker = walk) {
  walker(root, (el) => {
    cleanupElement(el);
    cleanupAttributes(el);
    delete el._x_marker;
  });
}
function warnAboutMissingPlugins() {
  let pluginDirectives = [
    ["ui", "dialog", ["[x-dialog], [x-popover]"]],
    ["anchor", "anchor", ["[x-anchor]"]],
    ["sort", "sort", ["[x-sort]"]]
  ];
  pluginDirectives.forEach(([plugin2, directive2, selectors]) => {
    if (directiveExists(directive2))
      return;
    selectors.some((selector) => {
      if (document.querySelector(selector)) {
        warn(`found "${selector}", but missing ${plugin2} plugin`);
        return true;
      }
    });
  });
}
var tickStack = [];
var isHolding = false;
function nextTick(callback = () => {}) {
  queueMicrotask(() => {
    isHolding || setTimeout(() => {
      releaseNextTicks();
    });
  });
  return new Promise((res) => {
    tickStack.push(() => {
      callback();
      res();
    });
  });
}
function releaseNextTicks() {
  isHolding = false;
  while (tickStack.length)
    tickStack.shift()();
}
function holdNextTicks() {
  isHolding = true;
}
function setClasses(el, value) {
  if (Array.isArray(value)) {
    return setClassesFromString(el, value.join(" "));
  } else if (typeof value === "object" && value !== null) {
    return setClassesFromObject(el, value);
  } else if (typeof value === "function") {
    return setClasses(el, value());
  }
  return setClassesFromString(el, value);
}
function splitClasses(classString) {
  return classString.split(/\s/).filter(Boolean);
}
function setClassesFromString(el, classString) {
  let missingClasses = (classString2) => splitClasses(classString2).filter((i) => !el.classList.contains(i)).filter(Boolean);
  let addClassesAndReturnUndo = (classes) => {
    el.classList.add(...classes);
    return () => {
      el.classList.remove(...classes);
    };
  };
  classString = classString === true ? classString = "" : classString || "";
  return addClassesAndReturnUndo(missingClasses(classString));
}
function setClassesFromObject(el, classObject) {
  let forAdd = Object.entries(classObject).flatMap(([classString, bool]) => bool ? splitClasses(classString) : false).filter(Boolean);
  let forRemove = Object.entries(classObject).flatMap(([classString, bool]) => !bool ? splitClasses(classString) : false).filter(Boolean);
  let added = [];
  let removed = [];
  forRemove.forEach((i) => {
    if (el.classList.contains(i)) {
      el.classList.remove(i);
      removed.push(i);
    }
  });
  forAdd.forEach((i) => {
    if (!el.classList.contains(i)) {
      el.classList.add(i);
      added.push(i);
    }
  });
  return () => {
    removed.forEach((i) => el.classList.add(i));
    added.forEach((i) => el.classList.remove(i));
  };
}
function setStyles(el, value) {
  if (typeof value === "object" && value !== null) {
    return setStylesFromObject(el, value);
  }
  return setStylesFromString(el, value);
}
function setStylesFromObject(el, value) {
  let previousStyles = {};
  Object.entries(value).forEach(([key, value2]) => {
    previousStyles[key] = el.style[key];
    if (!key.startsWith("--")) {
      key = kebabCase(key);
    }
    el.style.setProperty(key, value2);
  });
  setTimeout(() => {
    if (el.style.length === 0) {
      el.removeAttribute("style");
    }
  });
  return () => {
    setStyles(el, previousStyles);
  };
}
function setStylesFromString(el, value) {
  let cache = el.getAttribute("style", value);
  el.setAttribute("style", value);
  return () => {
    el.setAttribute("style", cache || "");
  };
}
function kebabCase(subject) {
  return subject.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}
function once(callback, fallback = () => {}) {
  let called = false;
  return function() {
    if (!called) {
      called = true;
      callback.apply(this, arguments);
    } else {
      fallback.apply(this, arguments);
    }
  };
}
directive("transition", (el, { value, modifiers, expression }, { evaluate: evaluate2 }) => {
  if (typeof expression === "function")
    expression = evaluate2(expression);
  if (expression === false)
    return;
  if (!expression || typeof expression === "boolean") {
    registerTransitionsFromHelper(el, modifiers, value);
  } else {
    registerTransitionsFromClassString(el, expression, value);
  }
});
function registerTransitionsFromClassString(el, classString, stage) {
  registerTransitionObject(el, setClasses, "");
  let directiveStorageMap = {
    enter: (classes) => {
      el._x_transition.enter.during = classes;
    },
    "enter-start": (classes) => {
      el._x_transition.enter.start = classes;
    },
    "enter-end": (classes) => {
      el._x_transition.enter.end = classes;
    },
    leave: (classes) => {
      el._x_transition.leave.during = classes;
    },
    "leave-start": (classes) => {
      el._x_transition.leave.start = classes;
    },
    "leave-end": (classes) => {
      el._x_transition.leave.end = classes;
    }
  };
  directiveStorageMap[stage](classString);
}
function registerTransitionsFromHelper(el, modifiers, stage) {
  registerTransitionObject(el, setStyles);
  let doesntSpecify = !modifiers.includes("in") && !modifiers.includes("out") && !stage;
  let transitioningIn = doesntSpecify || modifiers.includes("in") || ["enter"].includes(stage);
  let transitioningOut = doesntSpecify || modifiers.includes("out") || ["leave"].includes(stage);
  if (modifiers.includes("in") && !doesntSpecify) {
    modifiers = modifiers.filter((i, index) => index < modifiers.indexOf("out"));
  }
  if (modifiers.includes("out") && !doesntSpecify) {
    modifiers = modifiers.filter((i, index) => index > modifiers.indexOf("out"));
  }
  let wantsAll = !modifiers.includes("opacity") && !modifiers.includes("scale");
  let wantsOpacity = wantsAll || modifiers.includes("opacity");
  let wantsScale = wantsAll || modifiers.includes("scale");
  let opacityValue = wantsOpacity ? 0 : 1;
  let scaleValue = wantsScale ? modifierValue(modifiers, "scale", 95) / 100 : 1;
  let delay = modifierValue(modifiers, "delay", 0) / 1000;
  let origin = modifierValue(modifiers, "origin", "center");
  let property = "opacity, transform";
  let durationIn = modifierValue(modifiers, "duration", 150) / 1000;
  let durationOut = modifierValue(modifiers, "duration", 75) / 1000;
  let easing = `cubic-bezier(0.4, 0.0, 0.2, 1)`;
  if (transitioningIn) {
    el._x_transition.enter.during = {
      transformOrigin: origin,
      transitionDelay: `${delay}s`,
      transitionProperty: property,
      transitionDuration: `${durationIn}s`,
      transitionTimingFunction: easing
    };
    el._x_transition.enter.start = {
      opacity: opacityValue,
      transform: `scale(${scaleValue})`
    };
    el._x_transition.enter.end = {
      opacity: 1,
      transform: `scale(1)`
    };
  }
  if (transitioningOut) {
    el._x_transition.leave.during = {
      transformOrigin: origin,
      transitionDelay: `${delay}s`,
      transitionProperty: property,
      transitionDuration: `${durationOut}s`,
      transitionTimingFunction: easing
    };
    el._x_transition.leave.start = {
      opacity: 1,
      transform: `scale(1)`
    };
    el._x_transition.leave.end = {
      opacity: opacityValue,
      transform: `scale(${scaleValue})`
    };
  }
}
function registerTransitionObject(el, setFunction, defaultValue = {}) {
  if (!el._x_transition)
    el._x_transition = {
      enter: { during: defaultValue, start: defaultValue, end: defaultValue },
      leave: { during: defaultValue, start: defaultValue, end: defaultValue },
      in(before = () => {}, after = () => {}) {
        transition(el, setFunction, {
          during: this.enter.during,
          start: this.enter.start,
          end: this.enter.end
        }, before, after);
      },
      out(before = () => {}, after = () => {}) {
        transition(el, setFunction, {
          during: this.leave.during,
          start: this.leave.start,
          end: this.leave.end
        }, before, after);
      }
    };
}
window.Element.prototype._x_toggleAndCascadeWithTransitions = function(el, value, show, hide) {
  const nextTick2 = document.visibilityState === "visible" ? requestAnimationFrame : setTimeout;
  let clickAwayCompatibleShow = () => nextTick2(show);
  if (value) {
    if (el._x_transition && (el._x_transition.enter || el._x_transition.leave)) {
      el._x_transition.enter && (Object.entries(el._x_transition.enter.during).length || Object.entries(el._x_transition.enter.start).length || Object.entries(el._x_transition.enter.end).length) ? el._x_transition.in(show) : clickAwayCompatibleShow();
    } else {
      el._x_transition ? el._x_transition.in(show) : clickAwayCompatibleShow();
    }
    return;
  }
  el._x_hidePromise = el._x_transition ? new Promise((resolve, reject) => {
    el._x_transition.out(() => {}, () => resolve(hide));
    el._x_transitioning && el._x_transitioning.beforeCancel(() => reject({ isFromCancelledTransition: true }));
  }) : Promise.resolve(hide);
  queueMicrotask(() => {
    let closest = closestHide(el);
    if (closest) {
      if (!closest._x_hideChildren)
        closest._x_hideChildren = [];
      closest._x_hideChildren.push(el);
    } else {
      nextTick2(() => {
        let hideAfterChildren = (el2) => {
          let carry = Promise.all([
            el2._x_hidePromise,
            ...(el2._x_hideChildren || []).map(hideAfterChildren)
          ]).then(([i]) => i?.());
          delete el2._x_hidePromise;
          delete el2._x_hideChildren;
          return carry;
        };
        hideAfterChildren(el).catch((e) => {
          if (!e.isFromCancelledTransition)
            throw e;
        });
      });
    }
  });
};
function closestHide(el) {
  let parent = el.parentNode;
  if (!parent)
    return;
  return parent._x_hidePromise ? parent : closestHide(parent);
}
function transition(el, setFunction, { during, start: start2, end } = {}, before = () => {}, after = () => {}) {
  if (el._x_transitioning)
    el._x_transitioning.cancel();
  if (Object.keys(during).length === 0 && Object.keys(start2).length === 0 && Object.keys(end).length === 0) {
    before();
    after();
    return;
  }
  let undoStart, undoDuring, undoEnd;
  performTransition(el, {
    start() {
      undoStart = setFunction(el, start2);
    },
    during() {
      undoDuring = setFunction(el, during);
    },
    before,
    end() {
      undoStart();
      undoEnd = setFunction(el, end);
    },
    after,
    cleanup() {
      undoDuring();
      undoEnd();
    }
  });
}
function performTransition(el, stages) {
  let interrupted, reachedBefore, reachedEnd;
  let finish = once(() => {
    mutateDom(() => {
      interrupted = true;
      if (!reachedBefore)
        stages.before();
      if (!reachedEnd) {
        stages.end();
        releaseNextTicks();
      }
      stages.after();
      if (el.isConnected)
        stages.cleanup();
      delete el._x_transitioning;
    });
  });
  el._x_transitioning = {
    beforeCancels: [],
    beforeCancel(callback) {
      this.beforeCancels.push(callback);
    },
    cancel: once(function() {
      while (this.beforeCancels.length) {
        this.beforeCancels.shift()();
      }
      finish();
    }),
    finish
  };
  mutateDom(() => {
    stages.start();
    stages.during();
  });
  holdNextTicks();
  requestAnimationFrame(() => {
    if (interrupted)
      return;
    let duration = Number(getComputedStyle(el).transitionDuration.replace(/,.*/, "").replace("s", "")) * 1000;
    let delay = Number(getComputedStyle(el).transitionDelay.replace(/,.*/, "").replace("s", "")) * 1000;
    if (duration === 0)
      duration = Number(getComputedStyle(el).animationDuration.replace("s", "")) * 1000;
    mutateDom(() => {
      stages.before();
    });
    reachedBefore = true;
    requestAnimationFrame(() => {
      if (interrupted)
        return;
      mutateDom(() => {
        stages.end();
      });
      releaseNextTicks();
      setTimeout(el._x_transitioning.finish, duration + delay);
      reachedEnd = true;
    });
  });
}
function modifierValue(modifiers, key, fallback) {
  if (modifiers.indexOf(key) === -1)
    return fallback;
  const rawValue = modifiers[modifiers.indexOf(key) + 1];
  if (!rawValue)
    return fallback;
  if (key === "scale") {
    if (isNaN(rawValue))
      return fallback;
  }
  if (key === "duration" || key === "delay") {
    let match = rawValue.match(/([0-9]+)ms/);
    if (match)
      return match[1];
  }
  if (key === "origin") {
    if (["top", "right", "left", "center", "bottom"].includes(modifiers[modifiers.indexOf(key) + 2])) {
      return [rawValue, modifiers[modifiers.indexOf(key) + 2]].join(" ");
    }
  }
  return rawValue;
}
function bind(el, name, value, modifiers = []) {
  if (!el._x_bindings)
    el._x_bindings = reactive({});
  el._x_bindings[name] = value;
  name = modifiers.includes("camel") ? camelCase(name) : name;
  switch (name) {
    case "value":
      bindInputValue(el, value);
      break;
    case "style":
      bindStyles(el, value);
      break;
    case "class":
      bindClasses(el, value);
      break;
    case "selected":
    case "checked":
      bindAttributeAndProperty(el, name, value);
      break;
    default:
      bindAttribute(el, name, value);
      break;
  }
}
function bindInputValue(el, value) {
  if (isRadio(el)) {
    if (el.attributes.value === undefined) {
      el.value = value;
    }
  } else if (isCheckbox(el)) {
    if (Number.isInteger(value)) {
      el.value = value;
    } else if (!Array.isArray(value) && typeof value !== "boolean" && ![null, undefined].includes(value)) {
      el.value = String(value);
    } else {
      if (Array.isArray(value)) {
        el.checked = value.some((val) => checkedAttrLooseCompare(val, el.value));
      } else {
        el.checked = !!value;
      }
    }
  } else if (el.tagName === "SELECT") {
    updateSelect(el, value);
  } else if (el.tagName === "OPTION") {
    bindAttribute(el, "value", value);
  } else {
    if (el.value === value && (typeof value !== "object" || value === null))
      return;
    el.value = value === undefined ? "" : value;
  }
}
function bindClasses(el, value) {
  if (el._x_undoAddedClasses)
    el._x_undoAddedClasses();
  el._x_undoAddedClasses = setClasses(el, value);
}
function bindStyles(el, value) {
  if (el._x_undoAddedStyles)
    el._x_undoAddedStyles();
  el._x_undoAddedStyles = setStyles(el, value);
}
function bindAttributeAndProperty(el, name, value) {
  bindAttribute(el, name, value);
  setPropertyIfChanged(el, name, value);
}
function bindAttribute(el, name, value) {
  if ([null, undefined, false].includes(value) && attributeShouldntBePreservedIfFalsy(name)) {
    el.removeAttribute(name);
  } else {
    if (isBooleanAttr(name))
      value = name;
    if (isObjectAttr(value))
      value = JSON.stringify(value);
    setIfChanged(el, name, value);
  }
}
function setIfChanged(el, attrName, value) {
  if (el.getAttribute(attrName) != value) {
    el.setAttribute(attrName, value);
  }
}
function setPropertyIfChanged(el, propName, value) {
  if (el[propName] !== value) {
    el[propName] = value;
  }
}
function updateSelect(el, value) {
  const arrayWrappedValue = [].concat(value).map((value2) => {
    return value2 + "";
  });
  Array.from(el.options).forEach((option) => {
    option.selected = arrayWrappedValue.includes(option.value);
  });
}
function camelCase(subject) {
  return subject.toLowerCase().replace(/-(\w)/g, (match, char) => char.toUpperCase());
}
function checkedAttrLooseCompare(valueA, valueB) {
  return valueA == valueB;
}
function safeParseBoolean(rawValue) {
  if ([1, "1", "true", "on", "yes", true].includes(rawValue)) {
    return true;
  }
  if ([0, "0", "false", "off", "no", false].includes(rawValue)) {
    return false;
  }
  return rawValue ? Boolean(rawValue) : null;
}
var booleanAttributes = /* @__PURE__ */ new Set([
  "allowfullscreen",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "default",
  "defer",
  "disabled",
  "formnovalidate",
  "inert",
  "ismap",
  "itemscope",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "selected",
  "shadowrootclonable",
  "shadowrootdelegatesfocus",
  "shadowrootserializable"
]);
function isBooleanAttr(attrName) {
  return booleanAttributes.has(attrName);
}
function attributeShouldntBePreservedIfFalsy(name) {
  return !["aria-pressed", "aria-checked", "aria-expanded", "aria-selected"].includes(name);
}
function isObjectAttr(value) {
  return typeof value === "object" && value !== null;
}
function getBinding(el, name, fallback) {
  if (el._x_bindings && el._x_bindings[name] !== undefined)
    return el._x_bindings[name];
  return getAttributeBinding(el, name, fallback);
}
function extractProp(el, name, fallback, extract = true) {
  if (el._x_bindings && el._x_bindings[name] !== undefined)
    return el._x_bindings[name];
  if (el._x_inlineBindings && el._x_inlineBindings[name] !== undefined) {
    let binding = el._x_inlineBindings[name];
    binding.extract = extract;
    return dontAutoEvaluateFunctions(() => {
      return evaluate(el, binding.expression);
    });
  }
  return getAttributeBinding(el, name, fallback);
}
function getAttributeBinding(el, name, fallback) {
  let attr = el.getAttribute(name);
  if (attr === null)
    return typeof fallback === "function" ? fallback() : fallback;
  if (attr === "")
    return true;
  if (isBooleanAttr(name)) {
    return !![name, "true"].includes(attr);
  }
  return attr;
}
function isCheckbox(el) {
  return el.type === "checkbox" || el.localName === "ui-checkbox" || el.localName === "ui-switch";
}
function isRadio(el) {
  return el.type === "radio" || el.localName === "ui-radio";
}
function debounce(func, wait) {
  let timeout;
  return function() {
    const context = this, args = arguments;
    const later = function() {
      timeout = null;
      func.apply(context, args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
function throttle(func, limit) {
  let inThrottle;
  return function() {
    let context = this, args = arguments;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}
function entangle({ get: outerGet, set: outerSet }, { get: innerGet, set: innerSet }) {
  let firstRun = true;
  let outerHash;
  let innerHash;
  let reference = effect(() => {
    let outer = outerGet();
    let inner = innerGet();
    if (firstRun) {
      innerSet(cloneIfObject(outer));
      firstRun = false;
    } else {
      let outerHashLatest = JSON.stringify(outer);
      let innerHashLatest = JSON.stringify(inner);
      if (outerHashLatest !== outerHash) {
        innerSet(cloneIfObject(outer));
      } else if (outerHashLatest !== innerHashLatest) {
        outerSet(cloneIfObject(inner));
      }
    }
    outerHash = JSON.stringify(outerGet());
    innerHash = JSON.stringify(innerGet());
  });
  return () => {
    release(reference);
  };
}
function cloneIfObject(value) {
  return typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
}
function plugin(callback) {
  let callbacks = Array.isArray(callback) ? callback : [callback];
  callbacks.forEach((i) => i(alpine_default));
}
var stores = {};
var isReactive = false;
function store(name, value) {
  if (!isReactive) {
    stores = reactive(stores);
    isReactive = true;
  }
  if (value === undefined) {
    return stores[name];
  }
  stores[name] = value;
  if (typeof value === "object" && value !== null && value._x_interceptor) {
    stores[name] = value.initialize(stores, name, name, () => {});
  } else {
    initInterceptors(stores[name]);
  }
  if (typeof value === "object" && value !== null && value.hasOwnProperty("init") && typeof value.init === "function") {
    stores[name].init();
  }
}
function getStores() {
  return stores;
}
var binds = {};
function bind2(name, bindings) {
  let getBindings = typeof bindings !== "function" ? () => bindings : bindings;
  if (name instanceof Element) {
    return applyBindingsObject(name, getBindings());
  } else {
    binds[name] = getBindings;
  }
  return () => {};
}
function injectBindingProviders(obj) {
  Object.entries(binds).forEach(([name, callback]) => {
    Object.defineProperty(obj, name, {
      get() {
        return (...args) => {
          return callback(...args);
        };
      }
    });
  });
  return obj;
}
function applyBindingsObject(el, obj, original) {
  let cleanupRunners = [];
  while (cleanupRunners.length)
    cleanupRunners.pop()();
  let attributes = Object.entries(obj).map(([name, value]) => ({ name, value }));
  let staticAttributes = attributesOnly(attributes);
  attributes = attributes.map((attribute) => {
    if (staticAttributes.find((attr) => attr.name === attribute.name)) {
      return {
        name: `x-bind:${attribute.name}`,
        value: `"${attribute.value}"`
      };
    }
    return attribute;
  });
  directives(el, attributes, original).map((handle) => {
    cleanupRunners.push(handle.runCleanups);
    handle();
  });
  return () => {
    while (cleanupRunners.length)
      cleanupRunners.pop()();
  };
}
var datas = {};
function data(name, callback) {
  datas[name] = callback;
}
function injectDataProviders(obj, context) {
  Object.entries(datas).forEach(([name, callback]) => {
    Object.defineProperty(obj, name, {
      get() {
        return (...args) => {
          return callback.bind(context)(...args);
        };
      },
      enumerable: false
    });
  });
  return obj;
}
var Alpine = {
  get reactive() {
    return reactive;
  },
  get release() {
    return release;
  },
  get effect() {
    return effect;
  },
  get raw() {
    return raw;
  },
  get transaction() {
    return transaction;
  },
  version: "3.17.2",
  flushAndStopDeferringMutations,
  dontAutoEvaluateFunctions,
  disableEffectScheduling,
  startObservingMutations,
  stopObservingMutations,
  setReactivityEngine,
  onAttributeRemoved,
  onAttributesAdded,
  closestDataStack,
  skipDuringClone,
  onlyDuringClone,
  addRootSelector,
  addInitSelector,
  setErrorHandler,
  interceptClone,
  addScopeToNode,
  deferMutations,
  mapAttributes,
  evaluateLater,
  interceptInit,
  initInterceptors,
  injectMagics,
  setEvaluator,
  setRawEvaluator,
  mergeProxies,
  extractProp,
  findClosest,
  onElRemoved,
  closestRoot,
  destroyTree,
  interceptor,
  transition,
  setStyles,
  mutateDom,
  deferInit,
  directive,
  entangle,
  throttle,
  debounce,
  evaluate,
  evaluateRaw,
  initTree,
  nextTick,
  prefixed: prefix,
  prefix: setPrefix,
  plugin,
  magic,
  store,
  start,
  clone,
  cloneNode,
  bound: getBinding,
  $data: scope,
  watch,
  walk,
  data,
  bind: bind2
};
var alpine_default = Alpine;
function makeMap(str) {
  const map = /* @__PURE__ */ Object.create(null);
  for (const key of str.split(","))
    map[key] = 1;
  return (val) => (val in map);
}
var EMPTY_OBJ = Object.freeze({});
var EMPTY_ARR = Object.freeze([]);
var extend = Object.assign;
var hasOwnProperty = Object.prototype.hasOwnProperty;
var hasOwn = (val, key) => hasOwnProperty.call(val, key);
var isArray = Array.isArray;
var isMap = (val) => toTypeString(val) === "[object Map]";
var isString = (val) => typeof val === "string";
var isSymbol = (val) => typeof val === "symbol";
var isObject = (val) => val !== null && typeof val === "object";
var objectToString = Object.prototype.toString;
var toTypeString = (value) => objectToString.call(value);
var toRawType = (value) => {
  return toTypeString(value).slice(8, -1);
};
var isIntegerKey = (key) => isString(key) && key !== "NaN" && key[0] !== "-" && "" + parseInt(key, 10) === key;
var cacheStringFunction = (fn) => {
  const cache = /* @__PURE__ */ Object.create(null);
  return (str) => {
    const hit = cache[str];
    return hit || (cache[str] = fn(str));
  };
};
var camelizeRE = /-\w/g;
var camelize = cacheStringFunction((str) => {
  return str.replace(camelizeRE, (c) => c.slice(1).toUpperCase());
});
var hyphenateRE = /\B([A-Z])/g;
var hyphenate = cacheStringFunction((str) => str.replace(hyphenateRE, "-$1").toLowerCase());
var capitalize = cacheStringFunction((str) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
});
var toHandlerKey = cacheStringFunction((str) => {
  const s = str ? `on${capitalize(str)}` : ``;
  return s;
});
var hasChanged = (value, oldValue) => !Object.is(value, oldValue);
var specialBooleanAttrs = `itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly`;
var isBooleanAttr2 = /* @__PURE__ */ makeMap(specialBooleanAttrs + `,async,autofocus,autoplay,controls,default,defer,disabled,inert,loop,open,required,reversed,scoped,seamless,checked,muted,multiple,selected`);
function warn2(msg, ...args) {
  console.warn(`[Vue warn] ${msg}`, ...args);
}
var activeEffectScope;
var activeSub;
var pausedQueueEffects = /* @__PURE__ */ new WeakSet;
var ReactiveEffect = class {
  constructor(fn) {
    this.fn = fn;
    this.deps = undefined;
    this.depsTail = undefined;
    this.flags = 1 | 4;
    this.next = undefined;
    this.cleanup = undefined;
    this.scheduler = undefined;
    if (activeEffectScope) {
      if (activeEffectScope.active) {
        activeEffectScope.effects.push(this);
      } else {
        this.flags &= -2;
      }
    }
  }
  pause() {
    this.flags |= 64;
  }
  resume() {
    if (this.flags & 64) {
      this.flags &= -65;
      if (pausedQueueEffects.has(this)) {
        pausedQueueEffects.delete(this);
        this.trigger();
      }
    }
  }
  notify() {
    if (this.flags & 2 && !(this.flags & 32)) {
      return;
    }
    if (!(this.flags & 8)) {
      batch(this);
    }
  }
  run() {
    if (!(this.flags & 1)) {
      return this.fn();
    }
    this.flags |= 2;
    cleanupEffect(this);
    prepareDeps(this);
    const prevEffect = activeSub;
    const prevShouldTrack = shouldTrack;
    activeSub = this;
    shouldTrack = true;
    try {
      return this.fn();
    } finally {
      if (activeSub !== this) {
        warn2("Active effect was not restored correctly - this is likely a Vue internal bug.");
      }
      cleanupDeps(this);
      activeSub = prevEffect;
      shouldTrack = prevShouldTrack;
      this.flags &= -3;
    }
  }
  stop() {
    if (this.flags & 1) {
      for (let link = this.deps;link; link = link.nextDep) {
        removeSub(link);
      }
      this.deps = this.depsTail = undefined;
      cleanupEffect(this);
      this.onStop && this.onStop();
      this.flags &= -2;
    }
  }
  trigger() {
    if (this.flags & 64) {
      pausedQueueEffects.add(this);
    } else if (this.scheduler) {
      this.scheduler();
    } else {
      this.runIfDirty();
    }
  }
  runIfDirty() {
    if (isDirty(this)) {
      this.run();
    }
  }
  get dirty() {
    return isDirty(this);
  }
};
var batchDepth = 0;
var batchedSub;
var batchedComputed;
function batch(sub, isComputed = false) {
  sub.flags |= 8;
  if (isComputed) {
    sub.next = batchedComputed;
    batchedComputed = sub;
    return;
  }
  sub.next = batchedSub;
  batchedSub = sub;
}
function startBatch() {
  batchDepth++;
}
function endBatch() {
  if (--batchDepth > 0) {
    return;
  }
  if (batchedComputed) {
    let e = batchedComputed;
    batchedComputed = undefined;
    while (e) {
      const next = e.next;
      e.next = undefined;
      e.flags &= -9;
      e = next;
    }
  }
  let error2;
  while (batchedSub) {
    let e = batchedSub;
    batchedSub = undefined;
    while (e) {
      const next = e.next;
      e.next = undefined;
      e.flags &= -9;
      if (e.flags & 1) {
        try {
          e.trigger();
        } catch (err) {
          if (!error2)
            error2 = err;
        }
      }
      e = next;
    }
  }
  if (error2)
    throw error2;
}
function prepareDeps(sub) {
  for (let link = sub.deps;link; link = link.nextDep) {
    link.version = -1;
    link.prevActiveLink = link.dep.activeLink;
    link.dep.activeLink = link;
  }
}
function cleanupDeps(sub) {
  let head;
  let tail = sub.depsTail;
  let link = tail;
  while (link) {
    const prev = link.prevDep;
    if (link.version === -1) {
      if (link === tail)
        tail = prev;
      removeSub(link);
      removeDep(link);
    } else {
      head = link;
    }
    link.dep.activeLink = link.prevActiveLink;
    link.prevActiveLink = undefined;
    link = prev;
  }
  sub.deps = head;
  sub.depsTail = tail;
}
function isDirty(sub) {
  for (let link = sub.deps;link; link = link.nextDep) {
    if (link.dep.version !== link.version || link.dep.computed && (refreshComputed(link.dep.computed) || link.dep.version !== link.version)) {
      return true;
    }
  }
  if (sub._dirty) {
    return true;
  }
  return false;
}
function refreshComputed(computed) {
  if (computed.flags & 4 && !(computed.flags & 16)) {
    return;
  }
  computed.flags &= -17;
  if (computed.globalVersion === globalVersion) {
    return;
  }
  computed.globalVersion = globalVersion;
  if (!computed.isSSR && computed.flags & 128 && (!computed.deps && !computed._dirty || !isDirty(computed))) {
    return;
  }
  computed.flags |= 2;
  const dep = computed.dep;
  const prevSub = activeSub;
  const prevShouldTrack = shouldTrack;
  activeSub = computed;
  shouldTrack = true;
  try {
    prepareDeps(computed);
    const value = computed.fn(computed._value);
    if (dep.version === 0 || hasChanged(value, computed._value)) {
      computed.flags |= 128;
      computed._value = value;
      dep.version++;
    }
  } catch (err) {
    dep.version++;
    throw err;
  } finally {
    activeSub = prevSub;
    shouldTrack = prevShouldTrack;
    cleanupDeps(computed);
    computed.flags &= -3;
  }
}
function removeSub(link, soft = false) {
  const { dep, prevSub, nextSub } = link;
  if (prevSub) {
    prevSub.nextSub = nextSub;
    link.prevSub = undefined;
  }
  if (nextSub) {
    nextSub.prevSub = prevSub;
    link.nextSub = undefined;
  }
  if (dep.subsHead === link) {
    dep.subsHead = nextSub;
  }
  if (dep.subs === link) {
    dep.subs = prevSub;
    if (!prevSub && dep.computed) {
      dep.computed.flags &= -5;
      for (let l = dep.computed.deps;l; l = l.nextDep) {
        removeSub(l, true);
      }
    }
  }
  if (!soft && !--dep.sc && dep.map) {
    dep.map.delete(dep.key);
  }
}
function removeDep(link) {
  const { prevDep, nextDep } = link;
  if (prevDep) {
    prevDep.nextDep = nextDep;
    link.prevDep = undefined;
  }
  if (nextDep) {
    nextDep.prevDep = prevDep;
    link.nextDep = undefined;
  }
}
function effect2(fn, options) {
  if (fn.effect instanceof ReactiveEffect) {
    fn = fn.effect.fn;
  }
  const e = new ReactiveEffect(fn);
  if (options) {
    extend(e, options);
  }
  try {
    e.run();
  } catch (err) {
    e.stop();
    throw err;
  }
  const runner = e.run.bind(e);
  runner.effect = e;
  return runner;
}
function stop(runner) {
  runner.effect.stop();
}
var shouldTrack = true;
var trackStack = [];
function pauseTracking() {
  trackStack.push(shouldTrack);
  shouldTrack = false;
}
function resetTracking() {
  const last = trackStack.pop();
  shouldTrack = last === undefined ? true : last;
}
function cleanupEffect(e) {
  const { cleanup } = e;
  e.cleanup = undefined;
  if (cleanup) {
    const prevSub = activeSub;
    activeSub = undefined;
    try {
      cleanup();
    } finally {
      activeSub = prevSub;
    }
  }
}
var globalVersion = 0;
var Link = class {
  constructor(sub, dep) {
    this.sub = sub;
    this.dep = dep;
    this.version = dep.version;
    this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = undefined;
  }
};
var Dep = class {
  constructor(computed) {
    this.computed = computed;
    this.version = 0;
    this.activeLink = undefined;
    this.subs = undefined;
    this.map = undefined;
    this.key = undefined;
    this.sc = 0;
    this.__v_skip = true;
    if (true) {
      this.subsHead = undefined;
    }
  }
  track(debugInfo) {
    if (!activeSub || !shouldTrack || activeSub === this.computed) {
      return;
    }
    let link = this.activeLink;
    if (link === undefined || link.sub !== activeSub) {
      link = this.activeLink = new Link(activeSub, this);
      if (!activeSub.deps) {
        activeSub.deps = activeSub.depsTail = link;
      } else {
        link.prevDep = activeSub.depsTail;
        activeSub.depsTail.nextDep = link;
        activeSub.depsTail = link;
      }
      addSub(link);
    } else if (link.version === -1) {
      link.version = this.version;
      if (link.nextDep) {
        const next = link.nextDep;
        next.prevDep = link.prevDep;
        if (link.prevDep) {
          link.prevDep.nextDep = next;
        }
        link.prevDep = activeSub.depsTail;
        link.nextDep = undefined;
        activeSub.depsTail.nextDep = link;
        activeSub.depsTail = link;
        if (activeSub.deps === link) {
          activeSub.deps = next;
        }
      }
    }
    if (activeSub.onTrack) {
      activeSub.onTrack(extend({
        effect: activeSub
      }, debugInfo));
    }
    return link;
  }
  trigger(debugInfo) {
    this.version++;
    globalVersion++;
    this.notify(debugInfo);
  }
  notify(debugInfo) {
    startBatch();
    try {
      if (true) {
        for (let head = this.subsHead;head; head = head.nextSub) {
          if (head.sub.onTrigger && !(head.sub.flags & 8)) {
            head.sub.onTrigger(extend({
              effect: head.sub
            }, debugInfo));
          }
        }
      }
      for (let link = this.subs;link; link = link.prevSub) {
        if (link.sub.notify()) {
          link.sub.dep.notify();
        }
      }
    } finally {
      endBatch();
    }
  }
};
function addSub(link) {
  link.dep.sc++;
  if (link.sub.flags & 4) {
    const computed = link.dep.computed;
    if (computed && !link.dep.subs) {
      computed.flags |= 4 | 16;
      for (let l = computed.deps;l; l = l.nextDep) {
        addSub(l);
      }
    }
    const currentTail = link.dep.subs;
    if (currentTail !== link) {
      link.prevSub = currentTail;
      if (currentTail)
        currentTail.nextSub = link;
    }
    if (link.dep.subsHead === undefined) {
      link.dep.subsHead = link;
    }
    link.dep.subs = link;
  }
}
var targetMap = /* @__PURE__ */ new WeakMap;
var ITERATE_KEY = /* @__PURE__ */ Symbol("Object iterate");
var MAP_KEY_ITERATE_KEY = /* @__PURE__ */ Symbol("Map keys iterate");
var ARRAY_ITERATE_KEY = /* @__PURE__ */ Symbol("Array iterate");
function track(target, type, key) {
  if (shouldTrack && activeSub) {
    let depsMap = targetMap.get(target);
    if (!depsMap) {
      targetMap.set(target, depsMap = /* @__PURE__ */ new Map);
    }
    let dep = depsMap.get(key);
    if (!dep) {
      depsMap.set(key, dep = new Dep);
      dep.map = depsMap;
      dep.key = key;
    }
    if (true) {
      dep.track({
        target,
        type,
        key
      });
    }
  }
}
function trigger(target, type, key, newValue, oldValue, oldTarget) {
  const depsMap = targetMap.get(target);
  if (!depsMap) {
    globalVersion++;
    return;
  }
  const run = (dep) => {
    if (dep) {
      if (true) {
        dep.trigger({
          target,
          type,
          key,
          newValue,
          oldValue,
          oldTarget
        });
      }
    }
  };
  startBatch();
  if (type === "clear") {
    depsMap.forEach(run);
  } else {
    const targetIsArray = isArray(target);
    const isArrayIndex = targetIsArray && isIntegerKey(key);
    if (targetIsArray && key === "length") {
      const newLength = Number(newValue);
      depsMap.forEach((dep, key2) => {
        if (key2 === "length" || key2 === ARRAY_ITERATE_KEY || !isSymbol(key2) && key2 >= newLength) {
          run(dep);
        }
      });
    } else {
      if (key !== undefined || depsMap.has(undefined)) {
        run(depsMap.get(key));
      }
      if (isArrayIndex) {
        run(depsMap.get(ARRAY_ITERATE_KEY));
      }
      switch (type) {
        case "add":
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY));
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY));
            }
          } else if (isArrayIndex) {
            run(depsMap.get("length"));
          }
          break;
        case "delete":
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY));
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY));
            }
          }
          break;
        case "set":
          if (isMap(target)) {
            run(depsMap.get(ITERATE_KEY));
          }
          break;
      }
    }
  }
  endBatch();
}
function reactiveReadArray(array) {
  const raw2 = toRaw(array);
  if (raw2 === array)
    return raw2;
  track(raw2, "iterate", ARRAY_ITERATE_KEY);
  return isShallow(array) ? raw2 : raw2.map(toReactive);
}
function shallowReadArray(arr) {
  track(arr = toRaw(arr), "iterate", ARRAY_ITERATE_KEY);
  return arr;
}
function toWrapped(target, item) {
  if (isReadonly(target)) {
    return isReactive2(target) ? toReadonly(toReactive(item)) : toReadonly(item);
  }
  return toReactive(item);
}
var arrayInstrumentations = {
  __proto__: null,
  [Symbol.iterator]() {
    return iterator(this, Symbol.iterator, (item) => toWrapped(this, item));
  },
  concat(...args) {
    return reactiveReadArray(this).concat(...args.map((x) => isArray(x) ? reactiveReadArray(x) : x));
  },
  entries() {
    return iterator(this, "entries", (value) => {
      value[1] = toWrapped(this, value[1]);
      return value;
    });
  },
  every(fn, thisArg) {
    return apply(this, "every", fn, thisArg, undefined, arguments);
  },
  filter(fn, thisArg) {
    return apply(this, "filter", fn, thisArg, (v) => v.map((item) => toWrapped(this, item)), arguments);
  },
  find(fn, thisArg) {
    return apply(this, "find", fn, thisArg, (item) => toWrapped(this, item), arguments);
  },
  findIndex(fn, thisArg) {
    return apply(this, "findIndex", fn, thisArg, undefined, arguments);
  },
  findLast(fn, thisArg) {
    return apply(this, "findLast", fn, thisArg, (item) => toWrapped(this, item), arguments);
  },
  findLastIndex(fn, thisArg) {
    return apply(this, "findLastIndex", fn, thisArg, undefined, arguments);
  },
  forEach(fn, thisArg) {
    return apply(this, "forEach", fn, thisArg, undefined, arguments);
  },
  includes(...args) {
    return searchProxy(this, "includes", args);
  },
  indexOf(...args) {
    return searchProxy(this, "indexOf", args);
  },
  join(separator) {
    return reactiveReadArray(this).join(separator);
  },
  lastIndexOf(...args) {
    return searchProxy(this, "lastIndexOf", args);
  },
  map(fn, thisArg) {
    return apply(this, "map", fn, thisArg, undefined, arguments);
  },
  pop() {
    return noTracking(this, "pop");
  },
  push(...args) {
    return noTracking(this, "push", args);
  },
  reduce(fn, ...args) {
    return reduce(this, "reduce", fn, args);
  },
  reduceRight(fn, ...args) {
    return reduce(this, "reduceRight", fn, args);
  },
  shift() {
    return noTracking(this, "shift");
  },
  some(fn, thisArg) {
    return apply(this, "some", fn, thisArg, undefined, arguments);
  },
  splice(...args) {
    return noTracking(this, "splice", args);
  },
  toReversed() {
    return reactiveReadArray(this).toReversed();
  },
  toSorted(comparer) {
    return reactiveReadArray(this).toSorted(comparer);
  },
  toSpliced(...args) {
    return reactiveReadArray(this).toSpliced(...args);
  },
  unshift(...args) {
    return noTracking(this, "unshift", args);
  },
  values() {
    return iterator(this, "values", (item) => toWrapped(this, item));
  }
};
function iterator(self2, method, wrapValue) {
  const arr = shallowReadArray(self2);
  const iter = arr[method]();
  if (arr !== self2 && !isShallow(self2)) {
    iter._next = iter.next;
    iter.next = () => {
      const result = iter._next();
      if (!result.done) {
        result.value = wrapValue(result.value);
      }
      return result;
    };
  }
  return iter;
}
var arrayProto = Array.prototype;
function apply(self2, method, fn, thisArg, wrappedRetFn, args) {
  const arr = shallowReadArray(self2);
  const needsWrap = arr !== self2 && !isShallow(self2);
  const methodFn = arr[method];
  if (methodFn !== arrayProto[method]) {
    const result2 = methodFn.apply(self2, args);
    return needsWrap ? toReactive(result2) : result2;
  }
  let wrappedFn = fn;
  if (arr !== self2) {
    if (needsWrap) {
      wrappedFn = function(item, index) {
        return fn.call(this, toWrapped(self2, item), index, self2);
      };
    } else if (fn.length > 2) {
      wrappedFn = function(item, index) {
        return fn.call(this, item, index, self2);
      };
    }
  }
  const result = methodFn.call(arr, wrappedFn, thisArg);
  return needsWrap && wrappedRetFn ? wrappedRetFn(result) : result;
}
function reduce(self2, method, fn, args) {
  const arr = shallowReadArray(self2);
  const needsWrap = arr !== self2 && !isShallow(self2);
  let wrappedFn = fn;
  let wrapInitialAccumulator = false;
  if (arr !== self2) {
    if (needsWrap) {
      wrapInitialAccumulator = args.length === 0;
      wrappedFn = function(acc, item, index) {
        if (wrapInitialAccumulator) {
          wrapInitialAccumulator = false;
          acc = toWrapped(self2, acc);
        }
        return fn.call(this, acc, toWrapped(self2, item), index, self2);
      };
    } else if (fn.length > 3) {
      wrappedFn = function(acc, item, index) {
        return fn.call(this, acc, item, index, self2);
      };
    }
  }
  const result = arr[method](wrappedFn, ...args);
  return wrapInitialAccumulator ? toWrapped(self2, result) : result;
}
function searchProxy(self2, method, args) {
  const arr = toRaw(self2);
  track(arr, "iterate", ARRAY_ITERATE_KEY);
  const res = arr[method](...args);
  if ((res === -1 || res === false) && isProxy(args[0])) {
    args[0] = toRaw(args[0]);
    return arr[method](...args);
  }
  return res;
}
function noTracking(self2, method, args = []) {
  pauseTracking();
  startBatch();
  const res = toRaw(self2)[method].apply(self2, args);
  endBatch();
  resetTracking();
  return res;
}
var isNonTrackableKeys = /* @__PURE__ */ makeMap(`__proto__,__v_isRef,__isVue`);
var builtInSymbols = new Set(/* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((key) => key !== "arguments" && key !== "caller").map((key) => Symbol[key]).filter(isSymbol));
function hasOwnProperty2(key) {
  if (!isSymbol(key))
    key = String(key);
  const obj = toRaw(this);
  track(obj, "has", key);
  return obj.hasOwnProperty(key);
}
var BaseReactiveHandler = class {
  constructor(_isReadonly = false, _isShallow = false) {
    this._isReadonly = _isReadonly;
    this._isShallow = _isShallow;
  }
  get(target, key, receiver) {
    if (key === "__v_skip")
      return target["__v_skip"];
    const isReadonly2 = this._isReadonly, isShallow2 = this._isShallow;
    if (key === "__v_isReactive") {
      return !isReadonly2;
    } else if (key === "__v_isReadonly") {
      return isReadonly2;
    } else if (key === "__v_isShallow") {
      return isShallow2;
    } else if (key === "__v_raw") {
      if (receiver === (isReadonly2 ? isShallow2 ? shallowReadonlyMap : readonlyMap : isShallow2 ? shallowReactiveMap : reactiveMap).get(target) || Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)) {
        return target;
      }
      return;
    }
    const targetIsArray = isArray(target);
    if (!isReadonly2) {
      let fn;
      if (targetIsArray && (fn = arrayInstrumentations[key])) {
        return fn;
      }
      if (key === "hasOwnProperty") {
        return hasOwnProperty2;
      }
    }
    const res = Reflect.get(target, key, isRef(target) ? target : receiver);
    if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
      return res;
    }
    if (!isReadonly2) {
      track(target, "get", key);
    }
    if (isShallow2) {
      return res;
    }
    if (isRef(res)) {
      const value = targetIsArray && isIntegerKey(key) ? res : res.value;
      return isReadonly2 && isObject(value) ? readonly(value) : value;
    }
    if (isObject(res)) {
      return isReadonly2 ? readonly(res) : reactive2(res);
    }
    return res;
  }
};
var MutableReactiveHandler = class extends BaseReactiveHandler {
  constructor(isShallow2 = false) {
    super(false, isShallow2);
  }
  set(target, key, value, receiver) {
    let oldValue = target[key];
    const isArrayWithIntegerKey = isArray(target) && isIntegerKey(key);
    if (!this._isShallow) {
      const isOldValueReadonly = isReadonly(oldValue);
      if (!isShallow(value) && !isReadonly(value)) {
        oldValue = toRaw(oldValue);
        value = toRaw(value);
      }
      if (!isArrayWithIntegerKey && isRef(oldValue) && !isRef(value)) {
        if (isOldValueReadonly) {
          if (true) {
            warn2(`Set operation on key "${String(key)}" failed: target is readonly.`, target[key]);
          }
          return true;
        } else {
          oldValue.value = value;
          return true;
        }
      }
    }
    const hadKey = isArrayWithIntegerKey ? Number(key) < target.length : hasOwn(target, key);
    const result = Reflect.set(target, key, value, isRef(target) ? target : receiver);
    if (target === toRaw(receiver) && result) {
      if (!hadKey) {
        trigger(target, "add", key, value);
      } else if (hasChanged(value, oldValue)) {
        trigger(target, "set", key, value, oldValue);
      }
    }
    return result;
  }
  deleteProperty(target, key) {
    const hadKey = hasOwn(target, key);
    const oldValue = target[key];
    const result = Reflect.deleteProperty(target, key);
    if (result && hadKey) {
      trigger(target, "delete", key, undefined, oldValue);
    }
    return result;
  }
  has(target, key) {
    const result = Reflect.has(target, key);
    if (!isSymbol(key) || !builtInSymbols.has(key)) {
      track(target, "has", key);
    }
    return result;
  }
  ownKeys(target) {
    track(target, "iterate", isArray(target) ? "length" : ITERATE_KEY);
    return Reflect.ownKeys(target);
  }
};
var ReadonlyReactiveHandler = class extends BaseReactiveHandler {
  constructor(isShallow2 = false) {
    super(true, isShallow2);
  }
  set(target, key) {
    if (true) {
      warn2(`Set operation on key "${String(key)}" failed: target is readonly.`, target);
    }
    return true;
  }
  deleteProperty(target, key) {
    if (true) {
      warn2(`Delete operation on key "${String(key)}" failed: target is readonly.`, target);
    }
    return true;
  }
};
var mutableHandlers = /* @__PURE__ */ new MutableReactiveHandler;
var readonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler;
var toShallow = (value) => value;
var getProto = (v) => Reflect.getPrototypeOf(v);
function createIterableMethod(method, isReadonly2, isShallow2) {
  return function(...args) {
    const target = this["__v_raw"];
    const rawTarget = toRaw(target);
    const targetIsMap = isMap(rawTarget);
    const isPair = method === "entries" || method === Symbol.iterator && targetIsMap;
    const isKeyOnly = method === "keys" && targetIsMap;
    const innerIterator = target[method](...args);
    const wrap = isShallow2 ? toShallow : isReadonly2 ? toReadonly : toReactive;
    !isReadonly2 && track(rawTarget, "iterate", isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY);
    return extend(Object.create(innerIterator), {
      next() {
        const { value, done } = innerIterator.next();
        return done ? { value, done } : {
          value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
          done
        };
      }
    });
  };
}
function createReadonlyMethod(type) {
  return function(...args) {
    if (true) {
      const key = args[0] ? `on key "${args[0]}" ` : ``;
      warn2(`${capitalize(type)} operation ${key}failed: target is readonly.`, toRaw(this));
    }
    return type === "delete" ? false : type === "clear" ? undefined : this;
  };
}
function createInstrumentations(readonly2, shallow) {
  const instrumentations = {
    get(key) {
      const target = this["__v_raw"];
      const rawTarget = toRaw(target);
      const rawKey = toRaw(key);
      if (!readonly2) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, "get", key);
        }
        track(rawTarget, "get", rawKey);
      }
      const { has } = getProto(rawTarget);
      const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive;
      if (has.call(rawTarget, key)) {
        return wrap(target.get(key));
      } else if (has.call(rawTarget, rawKey)) {
        return wrap(target.get(rawKey));
      } else if (target !== rawTarget) {
        target.get(key);
      }
    },
    get size() {
      const target = this["__v_raw"];
      !readonly2 && track(toRaw(target), "iterate", ITERATE_KEY);
      return target.size;
    },
    has(key) {
      const target = this["__v_raw"];
      const rawTarget = toRaw(target);
      const rawKey = toRaw(key);
      if (!readonly2) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, "has", key);
        }
        track(rawTarget, "has", rawKey);
      }
      return key === rawKey ? target.has(key) : target.has(key) || target.has(rawKey);
    },
    forEach(callback, thisArg) {
      const observed = this;
      const target = observed["__v_raw"];
      const rawTarget = toRaw(target);
      const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive;
      !readonly2 && track(rawTarget, "iterate", ITERATE_KEY);
      return target.forEach((value, key) => {
        return callback.call(thisArg, wrap(value), wrap(key), observed);
      });
    }
  };
  extend(instrumentations, readonly2 ? {
    add: createReadonlyMethod("add"),
    set: createReadonlyMethod("set"),
    delete: createReadonlyMethod("delete"),
    clear: createReadonlyMethod("clear")
  } : {
    add(value) {
      const target = toRaw(this);
      const proto = getProto(target);
      const rawValue = toRaw(value);
      const valueToAdd = !shallow && !isShallow(value) && !isReadonly(value) ? rawValue : value;
      const hadKey = proto.has.call(target, valueToAdd) || hasChanged(value, valueToAdd) && proto.has.call(target, value) || hasChanged(rawValue, valueToAdd) && proto.has.call(target, rawValue);
      if (!hadKey) {
        target.add(valueToAdd);
        trigger(target, "add", valueToAdd, valueToAdd);
      }
      return this;
    },
    set(key, value) {
      if (!shallow && !isShallow(value) && !isReadonly(value)) {
        value = toRaw(value);
      }
      const target = toRaw(this);
      const { has, get: get2 } = getProto(target);
      let hadKey = has.call(target, key);
      if (!hadKey) {
        key = toRaw(key);
        hadKey = has.call(target, key);
      } else if (true) {
        checkIdentityKeys(target, has, key);
      }
      const oldValue = get2.call(target, key);
      target.set(key, value);
      if (!hadKey) {
        trigger(target, "add", key, value);
      } else if (hasChanged(value, oldValue)) {
        trigger(target, "set", key, value, oldValue);
      }
      return this;
    },
    delete(key) {
      const target = toRaw(this);
      const { has, get: get2 } = getProto(target);
      let hadKey = has.call(target, key);
      if (!hadKey) {
        key = toRaw(key);
        hadKey = has.call(target, key);
      } else if (true) {
        checkIdentityKeys(target, has, key);
      }
      const oldValue = get2 ? get2.call(target, key) : undefined;
      const result = target.delete(key);
      if (hadKey) {
        trigger(target, "delete", key, undefined, oldValue);
      }
      return result;
    },
    clear() {
      const target = toRaw(this);
      const hadItems = target.size !== 0;
      const oldTarget = isMap(target) ? new Map(target) : new Set(target);
      const result = target.clear();
      if (hadItems) {
        trigger(target, "clear", undefined, undefined, oldTarget);
      }
      return result;
    }
  });
  const iteratorMethods = [
    "keys",
    "values",
    "entries",
    Symbol.iterator
  ];
  iteratorMethods.forEach((method) => {
    instrumentations[method] = createIterableMethod(method, readonly2, shallow);
  });
  return instrumentations;
}
function createInstrumentationGetter(isReadonly2, shallow) {
  const instrumentations = createInstrumentations(isReadonly2, shallow);
  return (target, key, receiver) => {
    if (key === "__v_isReactive") {
      return !isReadonly2;
    } else if (key === "__v_isReadonly") {
      return isReadonly2;
    } else if (key === "__v_raw") {
      return target;
    }
    return Reflect.get(hasOwn(instrumentations, key) && key in target ? instrumentations : target, key, receiver);
  };
}
var mutableCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(false, false)
};
var readonlyCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(true, false)
};
function checkIdentityKeys(target, has, key) {
  const rawKey = toRaw(key);
  if (rawKey !== key && has.call(target, rawKey)) {
    const type = toRawType(target);
    warn2(`Reactive ${type} contains both the raw and reactive versions of the same object${type === `Map` ? ` as keys` : ``}, which can lead to inconsistencies. Avoid differentiating between the raw and reactive versions of an object and only use the reactive version if possible.`);
  }
}
var reactiveMap = /* @__PURE__ */ new WeakMap;
var shallowReactiveMap = /* @__PURE__ */ new WeakMap;
var readonlyMap = /* @__PURE__ */ new WeakMap;
var shallowReadonlyMap = /* @__PURE__ */ new WeakMap;
function targetTypeMap(rawType) {
  switch (rawType) {
    case "Object":
    case "Array":
      return 1;
    case "Map":
    case "Set":
    case "WeakMap":
    case "WeakSet":
      return 2;
    default:
      return 0;
  }
}
function reactive2(target) {
  if (/* @__PURE__ */ isReadonly(target)) {
    return target;
  }
  return createReactiveObject(target, false, mutableHandlers, mutableCollectionHandlers, reactiveMap);
}
function readonly(target) {
  return createReactiveObject(target, true, readonlyHandlers, readonlyCollectionHandlers, readonlyMap);
}
function createReactiveObject(target, isReadonly2, baseHandlers, collectionHandlers, proxyMap) {
  if (!isObject(target)) {
    if (true) {
      warn2(`value cannot be made ${isReadonly2 ? "readonly" : "reactive"}: ${String(target)}`);
    }
    return target;
  }
  if (target["__v_raw"] && !(isReadonly2 && target["__v_isReactive"])) {
    return target;
  }
  if (target["__v_skip"] || !Object.isExtensible(target)) {
    return target;
  }
  const existingProxy = proxyMap.get(target);
  if (existingProxy) {
    return existingProxy;
  }
  const targetType = targetTypeMap(toRawType(target));
  if (targetType === 0) {
    return target;
  }
  const proxy = new Proxy(target, targetType === 2 ? collectionHandlers : baseHandlers);
  proxyMap.set(target, proxy);
  return proxy;
}
function isReactive2(value) {
  if (/* @__PURE__ */ isReadonly(value)) {
    return /* @__PURE__ */ isReactive2(value["__v_raw"]);
  }
  return !!(value && value["__v_isReactive"]);
}
function isReadonly(value) {
  return !!(value && value["__v_isReadonly"]);
}
function isShallow(value) {
  return !!(value && value["__v_isShallow"]);
}
function isProxy(value) {
  return value ? !!value["__v_raw"] : false;
}
function toRaw(observed) {
  const raw2 = observed && observed["__v_raw"];
  return raw2 ? /* @__PURE__ */ toRaw(raw2) : observed;
}
var toReactive = (value) => isObject(value) ? /* @__PURE__ */ reactive2(value) : value;
var toReadonly = (value) => isObject(value) ? /* @__PURE__ */ readonly(value) : value;
function isRef(r) {
  return r ? r["__v_isRef"] === true : false;
}
magic("nextTick", () => nextTick);
magic("dispatch", (el) => dispatch.bind(dispatch, el));
magic("watch", (el, { evaluateLater: evaluateLater2, cleanup }) => (key, callback) => {
  let evaluate2 = evaluateLater2(key);
  let getter = () => {
    let value;
    evaluate2((i) => value = i);
    return value;
  };
  let unwatch = watch(getter, callback);
  cleanup(unwatch);
});
magic("store", getStores);
magic("data", (el) => scope(el));
magic("root", (el) => closestRoot(el));
magic("refs", (el) => {
  if (el._x_refs_proxy)
    return el._x_refs_proxy;
  el._x_refs_proxy = mergeProxies(getArrayOfRefObject(el));
  return el._x_refs_proxy;
});
function getArrayOfRefObject(el) {
  let refObjects = [];
  findClosest(el, (i) => {
    if (i._x_refs)
      refObjects.push(i._x_refs);
  });
  return refObjects;
}
var globalIdMemo = {};
function findAndIncrementId(name) {
  if (!globalIdMemo[name])
    globalIdMemo[name] = 0;
  return ++globalIdMemo[name];
}
function closestIdRoot(el, name) {
  return findClosest(el, (element) => {
    if (element._x_ids && element._x_ids[name])
      return true;
  });
}
function setIdRoot(el, name) {
  if (!el._x_ids)
    el._x_ids = {};
  if (!el._x_ids[name])
    el._x_ids[name] = findAndIncrementId(name);
}
magic("id", (el, { cleanup }) => (name, key = null) => {
  let cacheKey = `${name}${key ? `-${key}` : ""}`;
  return cacheIdByNameOnElement(el, cacheKey, cleanup, () => {
    let root = closestIdRoot(el, name);
    let id = root ? root._x_ids[name] : findAndIncrementId(name);
    return key ? `${name}-${id}-${key}` : `${name}-${id}`;
  });
});
interceptClone((from, to) => {
  if (from._x_id) {
    to._x_id = from._x_id;
  }
});
function cacheIdByNameOnElement(el, cacheKey, cleanup, callback) {
  if (!el._x_id)
    el._x_id = {};
  if (el._x_id[cacheKey])
    return el._x_id[cacheKey];
  let output = callback();
  el._x_id[cacheKey] = output;
  cleanup(() => {
    delete el._x_id[cacheKey];
  });
  return output;
}
magic("el", (el) => el);
warnMissingPluginMagic("Focus", "focus", "focus");
warnMissingPluginMagic("Persist", "persist", "persist");
function warnMissingPluginMagic(name, magicName, slug) {
  magic(magicName, (el) => warn(`You can't use [$${magicName}] without first installing the "${name}" plugin here: https://alpinejs.dev/plugins/${slug}`, el));
}
directive("modelable", (el, { expression }, { effect: effect3, evaluateLater: evaluateLater2, cleanup }) => {
  let func = evaluateLater2(expression);
  let innerGet = () => {
    let result;
    func((i) => result = i);
    return result;
  };
  let evaluateInnerSet = evaluateLater2(`${expression} = __placeholder`);
  let innerSet = (val) => evaluateInnerSet(() => {}, { scope: { __placeholder: val } });
  let initialValue = innerGet();
  innerSet(initialValue);
  queueMicrotask(() => {
    if (!el._x_model)
      return;
    el._x_removeModelListeners["default"]();
    let outerGet = el._x_model.get;
    let outerSet = el._x_model.setWithModifiers;
    let releaseEntanglement = entangle({
      get() {
        return outerGet();
      },
      set(value) {
        outerSet(value);
      }
    }, {
      get() {
        return innerGet();
      },
      set(value) {
        innerSet(value);
      }
    });
    cleanup(releaseEntanglement);
  });
});
directive("teleport", (el, { modifiers, expression }, { cleanup }) => {
  if (el.tagName.toLowerCase() !== "template")
    warn("x-teleport can only be used on a <template> tag", el);
  let target = getTarget(expression);
  let clone2 = el.content.cloneNode(true).firstElementChild;
  el._x_teleport = clone2;
  clone2._x_teleportBack = el;
  el.setAttribute("data-teleport-template", true);
  clone2.setAttribute("data-teleport-target", true);
  if (el._x_forwardEvents) {
    el._x_forwardEvents.forEach((eventName) => {
      clone2.addEventListener(eventName, (e) => {
        e.stopPropagation();
        el.dispatchEvent(new e.constructor(e.type, e));
      });
    });
  }
  addScopeToNode(clone2, {}, el);
  let placeInDom = (clone3, target2, modifiers2) => {
    if (modifiers2.includes("prepend")) {
      target2.parentNode.insertBefore(clone3, target2);
    } else if (modifiers2.includes("append")) {
      target2.parentNode.insertBefore(clone3, target2.nextSibling);
    } else {
      target2.appendChild(clone3);
    }
  };
  mutateDom(() => {
    skipDuringClone(() => {
      placeInDom(clone2, target, modifiers);
      initTree(clone2);
    })();
  });
  el._x_teleportPutBack = () => {
    let target2 = getTarget(expression);
    mutateDom(() => {
      placeInDom(el._x_teleport, target2, modifiers);
    });
  };
  cleanup(() => mutateDom(() => {
    clone2.remove();
    destroyTree(clone2);
  }));
});
var teleportContainerDuringClone = document.createElement("div");
function getTarget(expression) {
  let target = skipDuringClone(() => {
    return document.querySelector(expression);
  }, () => {
    return teleportContainerDuringClone;
  })();
  if (!target)
    warn(`Cannot find x-teleport element for selector: "${expression}"`);
  return target;
}
var handler = () => {};
handler.inline = (el, { modifiers }, { cleanup }) => {
  modifiers.includes("self") ? el._x_ignoreSelf = true : el._x_ignore = true;
  cleanup(() => {
    modifiers.includes("self") ? delete el._x_ignoreSelf : delete el._x_ignore;
  });
};
directive("ignore", handler);
directive("effect", skipDuringClone((el, { expression }, { effect: effect3 }) => {
  effect3(evaluateLater(el, expression));
}));
function on(el, event, modifiers, callback) {
  let listenerTarget = el;
  let handler4 = (e) => callback(e);
  let options = {};
  let wrapHandler = (callback2, wrapper) => (e) => wrapper(callback2, e);
  if (modifiers.includes("dot"))
    event = dotSyntax(event);
  if (modifiers.includes("camel"))
    event = camelCase2(event);
  if (modifiers.includes("capture"))
    options.capture = true;
  if (modifiers.includes("window"))
    listenerTarget = window;
  if (modifiers.includes("document"))
    listenerTarget = document;
  if (modifiers.includes("passive")) {
    options.passive = modifiers[modifiers.indexOf("passive") + 1] !== "false";
  }
  handler4 = addDebounceOrThrottle(modifiers, handler4);
  if (modifiers.includes("prevent"))
    handler4 = wrapHandler(handler4, (next, e) => {
      e.preventDefault();
      next(e);
    });
  if (modifiers.includes("stop"))
    handler4 = wrapHandler(handler4, (next, e) => {
      e.stopPropagation();
      next(e);
    });
  if (modifiers.includes("once")) {
    handler4 = wrapHandler(handler4, (next, e) => {
      next(e);
      listenerTarget.removeEventListener(event, handler4, options);
    });
  }
  if (modifiers.includes("away") || modifiers.includes("outside")) {
    listenerTarget = document;
    handler4 = wrapHandler(handler4, (next, e) => {
      if (el.contains(e.target))
        return;
      if (e.target.isConnected === false)
        return;
      if (el.offsetWidth < 1 && el.offsetHeight < 1)
        return;
      if (el._x_isShown === false)
        return;
      next(e);
    });
  }
  if (modifiers.includes("self"))
    handler4 = wrapHandler(handler4, (next, e) => {
      e.target === el && next(e);
    });
  if (event === "submit") {
    handler4 = wrapHandler(handler4, (next, e) => {
      if (e.target._x_pendingModelUpdates) {
        e.target._x_pendingModelUpdates.forEach((fn) => fn());
      }
      next(e);
    });
  }
  if (isKeyEvent(event) || isClickEvent(event)) {
    handler4 = wrapHandler(handler4, (next, e) => {
      if (isListeningForASpecificKeyThatHasntBeenPressed(e, modifiers)) {
        return;
      }
      next(e);
    });
  }
  listenerTarget.addEventListener(event, handler4, options);
  return () => {
    listenerTarget.removeEventListener(event, handler4, options);
  };
}
function addDebounceOrThrottle(modifiers, handler4) {
  if (modifiers.includes("debounce")) {
    let nextModifier = modifiers[modifiers.indexOf("debounce") + 1] || "invalid-wait";
    let wait = isNumeric(nextModifier.split("ms")[0]) ? Number(nextModifier.split("ms")[0]) : 250;
    handler4 = debounce(handler4, wait);
  }
  if (modifiers.includes("throttle")) {
    let nextModifier = modifiers[modifiers.indexOf("throttle") + 1] || "invalid-wait";
    let wait = isNumeric(nextModifier.split("ms")[0]) ? Number(nextModifier.split("ms")[0]) : 250;
    handler4 = throttle(handler4, wait);
  }
  return handler4;
}
function dotSyntax(subject) {
  return subject.replace(/-/g, ".");
}
function camelCase2(subject) {
  return subject.toLowerCase().replace(/-(\w)/g, (match, char) => char.toUpperCase());
}
function isNumeric(subject) {
  return !Array.isArray(subject) && !isNaN(subject);
}
function kebabCase2(subject) {
  if ([" ", "_"].includes(subject))
    return subject;
  return subject.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/[_\s]/, "-").toLowerCase();
}
function isKeyEvent(event) {
  return ["keydown", "keyup"].includes(event);
}
function isClickEvent(event) {
  return ["contextmenu", "click", "mouse"].some((i) => event.includes(i));
}
function isListeningForASpecificKeyThatHasntBeenPressed(e, modifiers) {
  let keyModifiers = modifiers.filter((i) => {
    return !["window", "document", "prevent", "stop", "once", "capture", "self", "away", "outside", "passive", "preserve-scroll", "blur", "change", "lazy"].includes(i);
  });
  if (keyModifiers.includes("debounce")) {
    let debounceIndex = keyModifiers.indexOf("debounce");
    keyModifiers.splice(debounceIndex, isNumeric((keyModifiers[debounceIndex + 1] || "invalid-wait").split("ms")[0]) ? 2 : 1);
  }
  if (keyModifiers.includes("throttle")) {
    let debounceIndex = keyModifiers.indexOf("throttle");
    keyModifiers.splice(debounceIndex, isNumeric((keyModifiers[debounceIndex + 1] || "invalid-wait").split("ms")[0]) ? 2 : 1);
  }
  if (keyModifiers.length === 0)
    return false;
  if (keyModifiers.length === 1 && keyToModifiers(e.key).includes(keyModifiers[0]))
    return false;
  const systemKeyModifiers = ["ctrl", "shift", "alt", "meta", "cmd", "super"];
  const selectedSystemKeyModifiers = systemKeyModifiers.filter((modifier) => keyModifiers.includes(modifier));
  keyModifiers = keyModifiers.filter((i) => !selectedSystemKeyModifiers.includes(i));
  if (selectedSystemKeyModifiers.length > 0) {
    const activelyPressedKeyModifiers = selectedSystemKeyModifiers.filter((modifier) => {
      if (modifier === "cmd" || modifier === "super")
        modifier = "meta";
      return e[`${modifier}Key`];
    });
    if (activelyPressedKeyModifiers.length === selectedSystemKeyModifiers.length) {
      if (isClickEvent(e.type))
        return false;
      if (keyToModifiers(e.key).includes(keyModifiers[0]))
        return false;
    }
  }
  return true;
}
function keyToModifiers(key) {
  if (!key)
    return [];
  key = kebabCase2(key);
  let modifierToKeyMap = {
    ctrl: "control",
    slash: "/",
    space: " ",
    spacebar: " ",
    cmd: "meta",
    esc: "escape",
    up: "arrow-up",
    down: "arrow-down",
    left: "arrow-left",
    right: "arrow-right",
    period: ".",
    comma: ",",
    equal: "=",
    minus: "-",
    underscore: "_"
  };
  modifierToKeyMap[key] = key;
  return Object.keys(modifierToKeyMap).map((modifier) => {
    if (modifierToKeyMap[modifier] === key)
      return modifier;
  }).filter((modifier) => modifier);
}
directive("model", (el, { modifiers, expression }, { effect: effect3, cleanup }) => {
  let scopeTarget = el;
  if (modifiers.includes("parent")) {
    scopeTarget = findClosest(el, (element) => element !== el);
  }
  let evaluateGet = evaluateLater(scopeTarget, expression);
  let evaluateSet;
  if (typeof expression === "string") {
    evaluateSet = evaluateLater(scopeTarget, `${expression} = __placeholder`);
  } else if (typeof expression === "function" && typeof expression() === "string") {
    evaluateSet = evaluateLater(scopeTarget, `${expression()} = __placeholder`);
  } else {
    evaluateSet = () => {};
  }
  let getValue = () => {
    let result;
    evaluateGet((value) => result = value);
    return isGetterSetter(result) ? result.get() : result;
  };
  let setValue = (value) => {
    let result;
    evaluateGet((value2) => result = value2);
    if (isGetterSetter(result)) {
      result.set(value);
    } else {
      evaluateSet(() => {}, {
        scope: { __placeholder: value }
      });
    }
  };
  if (typeof expression === "string" && el.type === "radio") {
    mutateDom(() => {
      if (!el.hasAttribute("name"))
        el.setAttribute("name", expression);
    });
  }
  let hasChangeModifier = modifiers.includes("change") || modifiers.includes("lazy");
  let hasBlurModifier = modifiers.includes("blur");
  let hasEnterModifier = modifiers.includes("enter");
  let hasExplicitEventModifiers = hasChangeModifier || hasBlurModifier || hasEnterModifier;
  let removeListener;
  if (isCloning) {
    removeListener = () => {};
  } else if (hasExplicitEventModifiers) {
    let listeners = [];
    let syncValue = (e) => setValue(getInputValue(el, modifiers, e, getValue()));
    if (hasChangeModifier) {
      listeners.push(on(el, "change", modifiers, syncValue));
    }
    if (hasBlurModifier) {
      listeners.push(on(el, "blur", modifiers, syncValue));
      if (el.form) {
        let form = el.form;
        let syncCallback = () => syncValue({ target: el });
        if (!form._x_pendingModelUpdates)
          form._x_pendingModelUpdates = [];
        form._x_pendingModelUpdates.push(syncCallback);
        cleanup(() => {
          if (form._x_pendingModelUpdates) {
            form._x_pendingModelUpdates.splice(form._x_pendingModelUpdates.indexOf(syncCallback), 1);
          }
        });
      }
    }
    if (hasEnterModifier) {
      listeners.push(on(el, "keydown", modifiers, (e) => {
        if (e.key === "Enter")
          syncValue(e);
      }));
    }
    removeListener = () => listeners.forEach((remove2) => remove2());
  } else {
    let event = el.tagName.toLowerCase() === "select" || ["checkbox", "radio"].includes(el.type) ? "change" : "input";
    removeListener = on(el, event, modifiers, (e) => {
      setValue(getInputValue(el, modifiers, e, getValue()));
    });
  }
  if (modifiers.includes("fill")) {
    if ([undefined, null, ""].includes(getValue()) || isCheckbox(el) && Array.isArray(getValue()) || el.tagName.toLowerCase() === "select" && el.multiple) {
      setValue(getInputValue(el, modifiers, { target: el }, getValue()));
    }
  }
  if (!el._x_removeModelListeners)
    el._x_removeModelListeners = {};
  el._x_removeModelListeners["default"] = removeListener;
  cleanup(() => el._x_removeModelListeners["default"]());
  if (el.form) {
    let removeResetListener = on(el.form, "reset", [], (e) => {
      nextTick(() => el._x_model && el._x_model.set(getInputValue(el, modifiers, { target: el }, getValue())));
    });
    cleanup(() => removeResetListener());
  }
  el._x_model = {
    get() {
      return getValue();
    },
    set(value) {
      setValue(value);
    },
    setWithModifiers: addDebounceOrThrottle(modifiers, setValue)
  };
  el._x_forceModelUpdate = (value) => {
    if (value === undefined && typeof expression === "string" && expression.match(/\./))
      value = "";
    mutateDom(() => {
      if (isCheckbox(el)) {
        if (Array.isArray(value)) {
          el.checked = value.some((val) => val == el.value);
        } else {
          el.checked = !!value;
        }
      } else if (isRadio(el)) {
        if (typeof value === "boolean") {
          el.checked = safeParseBoolean(el.value) === value;
        } else {
          el.checked = el.value == value;
        }
      } else {
        bind(el, "value", value);
      }
    });
  };
  if (el.tagName === "SELECT") {
    let observer2 = new MutationObserver(() => {
      el._x_forceModelUpdate(getValue());
    });
    observer2.observe(el, { childList: true });
    cleanup(() => observer2.disconnect());
  }
  effect3(() => {
    let value = getValue();
    if (modifiers.includes("unintrusive") && document.activeElement.isSameNode(el))
      return;
    el._x_forceModelUpdate(value);
  });
});
function getInputValue(el, modifiers, event, currentValue) {
  return mutateDom(() => {
    if (event instanceof CustomEvent && event.detail !== undefined)
      return event.detail !== null && event.detail !== undefined ? event.detail : event.target.value;
    else if (isCheckbox(el)) {
      if (Array.isArray(currentValue)) {
        let newValue = null;
        if (modifiers.includes("number")) {
          newValue = safeParseNumber(event.target.value);
        } else if (modifiers.includes("boolean")) {
          newValue = safeParseBoolean(event.target.value);
        } else {
          newValue = event.target.value;
        }
        return event.target.checked ? currentValue.includes(newValue) ? currentValue : currentValue.concat([newValue]) : currentValue.filter((el2) => !checkedAttrLooseCompare2(el2, newValue));
      } else {
        return event.target.checked;
      }
    } else if (el.tagName.toLowerCase() === "select" && el.multiple) {
      if (modifiers.includes("number")) {
        return Array.from(event.target.selectedOptions).map((option) => {
          let rawValue = option.value || option.text;
          return safeParseNumber(rawValue);
        });
      } else if (modifiers.includes("boolean")) {
        return Array.from(event.target.selectedOptions).map((option) => {
          let rawValue = option.value || option.text;
          return safeParseBoolean(rawValue);
        });
      }
      return Array.from(event.target.selectedOptions).map((option) => {
        return option.value || option.text;
      });
    } else {
      let newValue;
      if (isRadio(el)) {
        if (event.target.checked) {
          newValue = event.target.value;
        } else {
          newValue = currentValue;
        }
      } else {
        newValue = event.target.value;
      }
      if (modifiers.includes("number")) {
        return safeParseNumber(newValue);
      } else if (modifiers.includes("boolean")) {
        return safeParseBoolean(newValue);
      } else if (modifiers.includes("trim")) {
        return newValue.trim();
      } else {
        return newValue;
      }
    }
  });
}
function safeParseNumber(rawValue) {
  let number = rawValue ? parseFloat(rawValue) : null;
  return isNumeric2(number) ? number : rawValue;
}
function checkedAttrLooseCompare2(valueA, valueB) {
  return valueA == valueB;
}
function isNumeric2(subject) {
  return !Array.isArray(subject) && !isNaN(subject);
}
function isGetterSetter(value) {
  return value !== null && typeof value === "object" && typeof value.get === "function" && typeof value.set === "function";
}
directive("cloak", (el) => queueMicrotask(() => mutateDom(() => el.removeAttribute(prefix("cloak")))));
addInitSelector(() => `[${prefix("init")}]`);
directive("init", skipDuringClone((el, { expression }, { evaluate: evaluate2 }) => {
  if (typeof expression === "string") {
    return !!expression.trim() && evaluate2(expression, {}, false);
  }
  return evaluate2(expression, {}, false);
}));
directive("text", (el, { expression }, { effect: effect3, evaluateLater: evaluateLater2 }) => {
  let evaluate2 = evaluateLater2(expression);
  effect3(() => {
    evaluate2((value) => {
      mutateDom(() => {
        el.textContent = value;
      });
    });
  });
});
directive("html", (el, { expression }, { effect: effect3, evaluateLater: evaluateLater2 }) => {
  let evaluate2 = evaluateLater2(expression);
  effect3(() => {
    evaluate2((value) => {
      mutateDom(() => {
        Array.from(el.children).forEach((child) => destroyTree(child));
        el.innerHTML = value ?? "";
        el._x_ignoreSelf = true;
        initTree(el);
        delete el._x_ignoreSelf;
      });
    });
  }, { priority: "structural" });
});
mapAttributes(startingWith(":", into(prefix("bind:"))));
var handler2 = (el, { value, modifiers, expression, original }, { effect: effect3, cleanup }) => {
  if (!value) {
    let bindingProviders = {};
    injectBindingProviders(bindingProviders);
    let getBindings = evaluateLater(el, expression);
    getBindings((bindings) => {
      applyBindingsObject(el, bindings, original);
    }, { scope: bindingProviders });
    return;
  }
  if (value === "key")
    return storeKeyForXFor(el, expression);
  if (el._x_inlineBindings && el._x_inlineBindings[value] && el._x_inlineBindings[value].extract) {
    return;
  }
  let evaluate2 = evaluateLater(el, expression);
  effect3(() => evaluate2((result) => {
    if (result === undefined && typeof expression === "string" && expression.match(/\./)) {
      result = "";
    }
    mutateDom(() => bind(el, value, result, modifiers));
  }));
  cleanup(() => {
    el._x_undoAddedClasses && el._x_undoAddedClasses();
    el._x_undoAddedStyles && el._x_undoAddedStyles();
  });
};
handler2.inline = (el, { value, modifiers, expression }) => {
  if (!value)
    return;
  if (!el._x_inlineBindings)
    el._x_inlineBindings = {};
  el._x_inlineBindings[value] = { expression, extract: false };
};
directive("bind", handler2);
function storeKeyForXFor(el, expression) {
  el._x_keyExpression = expression;
}
addRootSelector(() => `[${prefix("data")}]`);
var dataForReconciliation = Symbol();
directive("data", (el, { expression }, { cleanup }) => {
  if (shouldSkipRegisteringDataDuringClone(el))
    return;
  let dataToReconcile = el[dataForReconciliation];
  if (dataToReconcile?.expression === expression)
    return;
  expression = expression === "" ? "{}" : expression;
  let magicContext = {};
  injectMagics(magicContext, el);
  let dataProviderContext = {};
  injectDataProviders(dataProviderContext, magicContext);
  let data2 = evaluate(el, expression, { scope: dataProviderContext });
  if (data2 === undefined || data2 === true)
    data2 = {};
  injectMagics(data2, el);
  let reactiveData;
  if (dataToReconcile?.reactiveData) {
    reactiveData = dataToReconcile.reactiveData;
    reconcileData(reactiveData, data2);
    let initialized = { expression };
    el[dataForReconciliation] = initialized;
    queueMicrotask(() => {
      if (el[dataForReconciliation] === initialized) {
        delete el[dataForReconciliation];
      }
    });
  } else {
    reactiveData = reactive(data2);
  }
  initInterceptors(reactiveData, cleanup);
  let undo = addScopeToNode(el, reactiveData);
  reactiveData["init"] && evaluate(el, reactiveData["init"]);
  cleanup(() => {
    reactiveData["destroy"] && evaluate(el, reactiveData["destroy"]);
    undo();
    let removed = { reactiveData };
    el[dataForReconciliation] = removed;
    queueMicrotask(() => {
      if (el[dataForReconciliation] === removed) {
        delete el[dataForReconciliation];
      }
    });
  });
});
function reconcileData(target, source) {
  Object.keys(source).forEach((key) => {
    let descriptor = Object.getOwnPropertyDescriptor(source, key);
    let existingDescriptor = Object.getOwnPropertyDescriptor(target, key);
    if (descriptor.get || descriptor.set || existingDescriptor?.get || existingDescriptor?.set) {
      if (existingDescriptor)
        delete target[key];
      if (!existingDescriptor)
        target[key] = undefined;
      descriptor.get || descriptor.set ? Object.defineProperty(target, key, descriptor) : target[key] = source[key];
    } else {
      target[key] = source[key];
    }
  });
  Object.keys(target).filter((key) => !Object.prototype.hasOwnProperty.call(source, key)).forEach((key) => delete target[key]);
}
interceptClone((from, to) => {
  if (from._x_dataStack) {
    to._x_dataStack = from._x_dataStack;
    to.setAttribute("data-has-alpine-state", true);
  }
});
function shouldSkipRegisteringDataDuringClone(el) {
  if (!isCloning)
    return false;
  if (isCloningLegacy)
    return true;
  return el.hasAttribute("data-has-alpine-state");
}
directive("show", (el, { modifiers, expression }, { effect: effect3 }) => {
  let evaluate2 = evaluateLater(el, expression);
  if (!el._x_doHide)
    el._x_doHide = () => {
      mutateDom(() => {
        el.style.setProperty("display", "none", modifiers.includes("important") ? "important" : undefined);
      });
    };
  if (!el._x_doShow)
    el._x_doShow = () => {
      mutateDom(() => {
        if (el.style.length === 1 && el.style.display === "none") {
          el.removeAttribute("style");
        } else {
          el.style.removeProperty("display");
        }
      });
    };
  let hide = () => {
    el._x_doHide();
    el._x_isShown = false;
  };
  let show = () => {
    el._x_doShow();
    el._x_isShown = true;
  };
  let clickAwayCompatibleShow = () => setTimeout(show);
  let toggle = once((value) => value ? show() : hide(), (value) => {
    if (typeof el._x_toggleAndCascadeWithTransitions === "function") {
      el._x_toggleAndCascadeWithTransitions(el, value, show, hide);
    } else {
      value ? clickAwayCompatibleShow() : hide();
    }
  });
  let oldValue;
  let firstTime = true;
  effect3(() => evaluate2((value) => {
    if (!firstTime && value === oldValue)
      return;
    if (modifiers.includes("immediate"))
      value ? clickAwayCompatibleShow() : hide();
    toggle(value);
    oldValue = value;
    firstTime = false;
  }));
});
directive("for", skipDuringClone((el, { expression }, { effect: effect3, cleanup }) => {
  let iteratorNames = parseForExpression(expression);
  let evaluateItems = evaluateLater(el, iteratorNames.items);
  let evaluateKey = evaluateLater(el, el._x_keyExpression || "index");
  el._x_lookup = /* @__PURE__ */ new Map;
  effect3(() => loop(el, iteratorNames, evaluateItems, evaluateKey), { priority: "structural" });
  cleanup(() => {
    el._x_lookup.forEach((el2) => mutateDom(() => {
      destroyTree(el2);
      el2.remove();
    }));
    delete el._x_lookup;
    delete el._x_lastRenderedEl;
  });
}));
function refreshScope(scope2) {
  return (newScope) => {
    Object.entries(newScope).forEach(([key, value]) => {
      scope2[key] = value;
    });
  };
}
function loop(templateEl, iteratorNames, evaluateItems, evaluateKey) {
  evaluateItems((items) => {
    if (isNumeric3(items))
      items = Array.from({ length: items }, (_, i) => i + 1);
    if (items === undefined || items === null)
      items = [];
    if (items instanceof Set)
      items = Array.from(items);
    if (items instanceof Map)
      items = Array.from(items);
    let oldLookup = templateEl._x_lookup;
    let lookup = /* @__PURE__ */ new Map;
    templateEl._x_lookup = lookup;
    let hasStringKeys = isObject2(items);
    let scopeEntries = Object.entries(items).map(([index, item]) => {
      if (!hasStringKeys)
        index = parseInt(index);
      let scope2 = getIterationScopeVariables(iteratorNames, item, index, items);
      let key;
      evaluateKey((innerKey) => {
        if (typeof innerKey === "object")
          warn("x-for key cannot be an object, it must be a string or an integer", templateEl);
        if (oldLookup.has(innerKey)) {
          lookup.set(innerKey, oldLookup.get(innerKey));
          oldLookup.delete(innerKey);
        }
        key = innerKey;
      }, { scope: { index, ...scope2 } });
      return [key, scope2];
    });
    mutateDom(() => {
      oldLookup.forEach((el) => {
        destroyTree(el);
        el.remove();
      });
      let added = /* @__PURE__ */ new Set;
      let prev = templateEl;
      scopeEntries.forEach(([key, scope2]) => {
        if (lookup.has(key)) {
          let el = lookup.get(key);
          el._x_refreshXForScope(scope2);
          if (prev.nextElementSibling !== el) {
            if (prev.nextElementSibling)
              el.replaceWith(prev.nextElementSibling);
            prev.after(el);
          }
          prev = el;
          if (el._x_currentIfEl) {
            if (el.nextElementSibling !== el._x_currentIfEl)
              prev.after(el._x_currentIfEl);
            prev = el._x_currentIfEl;
          }
          return;
        }
        if (templateEl.content.children.length > 1)
          warn("x-for templates require a single root element, additional elements will be ignored.", templateEl);
        let clone2 = document.importNode(templateEl.content, true).firstElementChild;
        let reactiveScope = reactive(scope2);
        addScopeToNode(clone2, reactiveScope, templateEl);
        clone2._x_refreshXForScope = refreshScope(reactiveScope);
        lookup.set(key, clone2);
        added.add(clone2);
        prev.after(clone2);
        prev = clone2;
      });
      added.forEach((clone2) => initTree(clone2));
      if (prev !== templateEl) {
        templateEl._x_lastRenderedEl = prev;
      } else {
        delete templateEl._x_lastRenderedEl;
      }
    });
  });
}
function parseForExpression(expression) {
  let forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/;
  let stripParensRE = /^\s*\(|\)\s*$/g;
  let forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/;
  let inMatch = expression.match(forAliasRE);
  if (!inMatch)
    return;
  let res = {};
  res.items = inMatch[2].trim();
  let item = inMatch[1].replace(stripParensRE, "").trim();
  let iteratorMatch = item.match(forIteratorRE);
  if (iteratorMatch) {
    res.item = item.replace(forIteratorRE, "").trim();
    res.index = iteratorMatch[1].trim();
    if (iteratorMatch[2]) {
      res.collection = iteratorMatch[2].trim();
    }
  } else {
    res.item = item;
  }
  return res;
}
function getIterationScopeVariables(iteratorNames, item, index, items) {
  let scopeVariables = {};
  if (/^\[.*\]$/.test(iteratorNames.item) && Array.isArray(item)) {
    let names = iteratorNames.item.replace("[", "").replace("]", "").split(",").map((i) => i.trim());
    names.forEach((name, i) => {
      scopeVariables[name] = item[i];
    });
  } else if (/^\{.*\}$/.test(iteratorNames.item) && !Array.isArray(item) && typeof item === "object") {
    let names = iteratorNames.item.replace("{", "").replace("}", "").split(",").map((i) => i.trim());
    names.forEach((name) => {
      scopeVariables[name] = item[name];
    });
  } else {
    scopeVariables[iteratorNames.item] = item;
  }
  if (iteratorNames.index)
    scopeVariables[iteratorNames.index] = index;
  if (iteratorNames.collection)
    scopeVariables[iteratorNames.collection] = items;
  return scopeVariables;
}
function isNumeric3(subject) {
  return typeof subject !== "object" && !isNaN(subject);
}
function isObject2(subject) {
  return typeof subject === "object" && !Array.isArray(subject);
}
function handler3() {}
handler3.inline = (el, { expression }, { cleanup }) => {
  let root = closestRoot(el);
  if (!root)
    return;
  if (!root._x_refs)
    root._x_refs = {};
  root._x_refs[expression] = el;
  cleanup(() => delete root._x_refs[expression]);
};
directive("ref", handler3);
directive("if", skipDuringClone((el, { expression }, { effect: effect3, cleanup }) => {
  if (el.tagName.toLowerCase() !== "template")
    warn("x-if can only be used on a <template> tag", el);
  let evaluate2 = evaluateLater(el, expression);
  let show = () => {
    if (el._x_currentIfEl)
      return el._x_currentIfEl;
    let clone2 = el.content.cloneNode(true).firstElementChild;
    addScopeToNode(clone2, {}, el);
    mutateDom(() => {
      el.after(clone2);
      initTree(clone2);
    });
    el._x_currentIfEl = clone2;
    el._x_lastRenderedEl = clone2;
    el._x_undoIf = () => {
      mutateDom(() => {
        destroyTree(clone2);
        clone2.remove();
      });
      delete el._x_currentIfEl;
      delete el._x_lastRenderedEl;
    };
    return clone2;
  };
  let hide = () => {
    if (!el._x_undoIf)
      return;
    el._x_undoIf();
    delete el._x_undoIf;
  };
  effect3(() => evaluate2((value) => {
    value ? show() : hide();
  }), { priority: "structural" });
  cleanup(() => el._x_undoIf && el._x_undoIf());
}));
directive("id", (el, { expression }, { evaluate: evaluate2 }) => {
  let names = evaluate2(expression);
  names.forEach((name) => setIdRoot(el, name));
});
interceptClone((from, to) => {
  if (from._x_ids) {
    to._x_ids = from._x_ids;
  }
});
mapAttributes(startingWith("@", into(prefix("on:"))));
directive("on", skipDuringClone((el, { value, modifiers, expression }, { cleanup }) => {
  let evaluate2 = expression ? evaluateLater(el, expression) : () => {};
  if (el.tagName.toLowerCase() === "template") {
    if (!el._x_forwardEvents)
      el._x_forwardEvents = [];
    if (!el._x_forwardEvents.includes(value))
      el._x_forwardEvents.push(value);
  }
  let removeListener = on(el, value, modifiers, (e) => {
    evaluate2(() => {}, { scope: { $event: e }, params: [e] });
  });
  cleanup(() => removeListener());
}));
warnMissingPluginDirective("Collapse", "collapse", "collapse");
warnMissingPluginDirective("Intersect", "intersect", "intersect");
warnMissingPluginDirective("Focus", "trap", "focus");
warnMissingPluginDirective("Mask", "mask", "mask");
function warnMissingPluginDirective(name, directiveName, slug) {
  directive(directiveName, (el) => warn(`You can't use [x-${directiveName}] without first installing the "${name}" plugin here: https://alpinejs.dev/plugins/${slug}`, el));
}
alpine_default.setEvaluator(normalEvaluator);
alpine_default.setRawEvaluator(normalRawEvaluator);
alpine_default.setReactivityEngine({
  reactive: reactive2,
  effect: (callback, options = {}) => {
    let runner;
    runner = effect2(callback, {
      scheduler: () => {
        if (!runner)
          return;
        options.scheduler ? options.scheduler(runner) : runner();
      }
    });
    return runner;
  },
  release: stop,
  raw: toRaw
});
var src_default = alpine_default;
var module_default = src_default;
/*! Bundled license information:

@vue/shared/dist/shared.esm-bundler.js:
  (**
  * @vue/shared v3.5.41
  * (c) 2018-present Yuxi (Evan) You and Vue contributors
  * @license MIT
  **)

@vue/reactivity/dist/reactivity.esm-bundler.js:
  (**
  * @vue/reactivity v3.5.41
  * (c) 2018-present Yuxi (Evan) You and Vue contributors
  * @license MIT
  **)
*/

// src/client.ts
window.Alpine = module_default;
module_default.start();
