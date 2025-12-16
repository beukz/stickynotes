/**
 * CANX SDK v1.3.4
 * Chrome Extension Advertising Network
 * (c) 2025 CANX Platform
 * 
 * MV3 Compliant - Privacy First
 */

(function(scope) {
    'use strict';

    class CanxSDK {
        constructor(config) {
            if (!config.apiKey) throw new Error("CANX: apiKey is required");
            this.apiKey = config.apiKey;
            this.extensionId = config.extensionId || 'unknown';
            this.debug = config.debug || false;
            
            // Configuration for the Ad Network API
            // Only the URL is needed. No Supabase Secrets/Keys are stored here.
            this.apiUrl = 'https://brhboniwoynkdfwtqffh.supabase.co';
            
            this._log('Initialized v1.3.4');
        }

        async renderAd(container, options = {}) {
            this._log('renderAd() called', { containerId: container?.id, options });

            if (typeof document === 'undefined') {
                this._error('renderAd() requires a DOM environment.');
                return;
            }

            if (!container) {
                this._error('Container element not found');
                return;
            }

            // Cleanup existing ad
            const existingHost = container.querySelector('div[id^="canx-root-"]');
            if (existingHost) {
                this._destroyAd(existingHost);
            }

            // Generate host
            const hostId = 'canx-root-' + Math.random().toString(36).substr(2, 9);
            const host = document.createElement('div');
            host.id = hostId;
            host.style.display = 'block';
            host.style.width = '100%';
            host.style.height = '100%'; 
            container.appendChild(host);

            const shadow = host.attachShadow({ mode: 'closed' });
            host._canxShadow = shadow;

            try {
                // Fetch Ad Decision
                const adData = await this._fetchAdDecision(options);
                
                if (!adData) {
                    this._log('No ad fill returned');
                    if (typeof options.onNoFill === 'function') options.onNoFill();
                    host.remove();
                    return;
                }

                this._renderSafeContent(shadow, adData);
                this._setupTracking(shadow, adData);

                if (options.refreshInterval) {
                    this._setupAutoRefresh(host, options);
                }

            } catch (err) {
                this._error('Render lifecycle failed', err);
                if (typeof options.onNoFill === 'function') options.onNoFill();
                host.remove();
            }
        }

        _destroyAd(host) {
            if (host._canxRefreshTimer) {
                clearTimeout(host._canxRefreshTimer);
            }
            host.remove();
        }

        /**
         * Secure Ad Fetching Logic
         * No credentials sent. Relies on SDK Key for authentication via Edge Function.
         */
        async _fetchAdDecision(options) {
            const format = options.format || 'CARD';
            
            try {
                this._log('Fetching from Edge Network...');
                const endpoint = this.apiUrl + '/functions/v1/get-ad-decision';
                
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sdkKey: this.apiKey,
                        format: format,
                        debug: this.debug
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    
                    if (data.error) {
                         this._error('API Error: ' + data.error);
                         return null;
                    }

                    if (data.ad === null) {
                        this._log('No Fill');
                        return null; 
                    }
                    
                    if (data.campaignId) {
                        this._log('Ad received', data.campaignId);
                        return data;
                    }
                } else {
                    this._log('Network unavailable (' + response.status + ')');
                }
            } catch (e) {
                this._log('Fetch error', e);
            }

            return null; // Return null on failure, do not fallback to client-side house ads
        }

        _renderSafeContent(shadowRoot, ad) {
            // 1. Clear existing
            const existingContainer = shadowRoot.querySelector('.canx-ad-container');
            if (existingContainer) existingContainer.remove();
            
            // 2. Inject CSS
            if (!shadowRoot.querySelector('style')) {
                const style = document.createElement('style');
                style.textContent = this._getStyles(ad.type);
                shadowRoot.appendChild(style);
            }

            // 3. Sanitize
            const safeAd = {
                img: this._sanitize(ad.imageUrl),
                headline: this._sanitize(ad.headline),
                desc: this._sanitize(ad.description),
                url: this._sanitize(ad.destinationUrl),
                cta: this._sanitize(ad.ctaText || 'Open'),
                alt: this._sanitize(ad.headline)
            };

            // 4. Render
            const wrapper = document.createElement('div');
            wrapper.className = 'canx-ad-container type-' + (ad.type || 'CARD').toLowerCase();
            wrapper.innerHTML = this._getTemplate(ad.type, safeAd);
            shadowRoot.appendChild(wrapper);
        }

        _setupTracking(shadowRoot, ad) {
            try {
                const wrapper = shadowRoot.querySelector('.canx-ad-container');
                const link = shadowRoot.querySelector('a');

                if ('IntersectionObserver' in scope) {
                    const observer = new IntersectionObserver((entries) => {
                        entries.forEach(entry => {
                            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                                setTimeout(() => {
                                    if (document.visibilityState === 'visible') {
                                        this._trackEvent('IMPRESSION', ad);
                                        observer.disconnect(); 
                                    }
                                }, 1000);
                            }
                        });
                    }, { threshold: 0.5 });
                    observer.observe(wrapper);
                } else {
                    this._trackEvent('IMPRESSION', ad);
                }

                if (link) {
                    link.addEventListener('click', () => {
                        this._trackEvent('CLICK', ad);
                    });
                }
            } catch (error) {
                this._error('Tracking setup failed', error);
            }
        }

        _setupAutoRefresh(host, options) {
            const minInterval = 30; 
            const intervalSeconds = Math.max(options.refreshInterval || 0, minInterval);
            const delayMs = intervalSeconds * 1000;

            host._canxRefreshTimer = setTimeout(() => {
                if (!document.body.contains(host)) return;
                if (document.hidden) return; // Don't refresh if backgrounded
                this._refreshAd(host, options);
            }, delayMs);
        }

        async _refreshAd(host, options) {
            const shadow = host._canxShadow;
            try {
                const adData = await this._fetchAdDecision(options);
                if (adData) {
                    this._renderSafeContent(shadow, adData);
                    this._setupTracking(shadow, adData);
                }
            } catch (e) {
                // ignore refresh errors
            }
            this._setupAutoRefresh(host, options);
        }

        async _trackEvent(eventType, ad) {
            if (this.debug) this._log('Tracking event', eventType);
            
            if (!ad.campaignId) return;

            try {
                // Use fetch with keepalive to ensure the request completes even if the page unloads (e.g. on click)
                await fetch(this.apiUrl + '/functions/v1/track-event', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        eventType: eventType,
                        campaignId: ad.campaignId,
                        sdkKey: this.apiKey,
                        timestamp: new Date().toISOString()
                    }),
                    keepalive: true
                });
            } catch (e) {
                // Silently fail in production, log in debug
                if (this.debug) this._error('Tracking failed', e);
            }
        }

        _getStyles(type) {
            const base = ":host { font-family: -apple-system, system-ui, sans-serif; box-sizing: border-box; display: block; } .canx-ad-container { position: relative; background: #fff; overflow: hidden; box-sizing: border-box; transition: opacity 0.3s; animation: fadeIn 0.5s ease-out; cursor: pointer; } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } a { text-decoration: none; color: inherit; display: block; height: 100%; } .badge { position: absolute; top: 0; right: 0; background: #f1f5f9; color: #64748b; font-size: 9px; padding: 2px 5px; border-bottom-left-radius: 4px; text-transform: uppercase; font-weight: 700; z-index: 10; font-family: sans-serif; }";

            if (type === 'BANNER') {
                return base + " .canx-ad-container { border: 1px solid #e2e8f0; height: 50px; padding: 0 10px; border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); } .canx-ad-container:hover { border-color: #cbd5e1; } a { display: flex; align-items: center; width: 100%; height: 100%; } img { width: 34px; height: 34px; border-radius: 4px; object-fit: cover; margin-right: 10px; flex-shrink: 0; border: 1px solid #f1f5f9; } .content { display: flex; flex-direction: column; justify-content: center; min-width: 0; flex: 1; padding-right: 25px; } .headline { font-size: 13px; font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; } .desc { font-size: 11px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; margin-top: 1px; }";
            }

            if (type === 'NATIVE') {
                return base + " .canx-ad-container { background: transparent; } a { display: flex; align-items: flex-start; gap: 12px; } img { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; flex-shrink: 0; border: 1px solid rgba(0,0,0,0.05); } .content { flex: 1; min-width: 0; display: flex; flex-direction: column; } .headline { font-size: 14px; font-weight: 600; color: inherit; margin-bottom: 2px; line-height: 1.3; } .desc { font-size: 12px; opacity: 0.8; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; } .badge { background: rgba(0,0,0,0.05); opacity: 0.7; }";
            }

            // CARD (300x250)
            return base + " .canx-ad-container { border: 1px solid #e2e8f0; border-radius: 8px; height: 100%; display: flex; flex-direction: column; box-shadow: 0 1px 3px rgba(0,0,0,0.05); } .canx-ad-container:hover { transform: translateY(-1px); box-shadow: 0 4px 6px rgba(0,0,0,0.05); } img { width: 100%; height: 140px; object-fit: cover; display: block; border-bottom: 1px solid #f1f5f9; } .content { padding: 12px; flex: 1; display: flex; flex-direction: column; } .headline { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 4px; line-height: 1.3; } .desc { font-size: 12px; color: #64748b; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: auto; }";
        }

        _getTemplate(type, data) {
            const start = '<a href="' + data.url + '" target="_blank">';
            const end = '</a>';
            const badge = '<div class="badge">Ad</div>';

            if (type === 'BANNER') {
                return start + 
                       '<img src="' + data.img + '" alt="' + data.alt + '" />' +
                       '<div class="content">' +
                           '<div class="headline">' + data.headline + '</div>' +
                           '<div class="desc">' + data.desc + '</div>' +
                       '</div>' +
                       badge + end;
            }
            
            if (type === 'NATIVE') {
                return start + 
                       '<img src="' + data.img + '" alt="' + data.alt + '" />' +
                       '<div class="content"><div class="headline">' + data.headline + '</div><div class="desc">' + data.desc + '</div></div>' + 
                       badge + end;
            }

            // CARD
            return start + 
                   '<img src="' + data.img + '" alt="' + data.alt + '" />' +
                   '<div class="content"><div class="headline">' + data.headline + '</div><div class="desc">' + data.desc + '</div></div>' + 
                   badge + end;
        }

        _sanitize(str) {
            if (!str) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        _log(msg, data) {
            if (this.debug) {
                console.log("%c[CANX] " + msg, "color: #4f46e5; font-weight: bold;", data || '');
            }
        }
        
        _error(msg, err) {
            console.error("%c[CANX Error] " + msg, "color: #ef4444; font-weight: bold;", err);
        }
    }

    scope.CANX = CanxSDK;

})(typeof window !== 'undefined' ? window : self);