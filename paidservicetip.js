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
        stakeUser: "mrkenocoin79",
        stats: { profit: 0, wagered: 0, startBal: 0, bets: 0, wins: 0, loss: 0, maxDD: 0 },
        selectedCurrency: "USDT",
        currentStatus: "USDT",
        lastError: "None",
        switchCounter: 0,
        nextSwitchAt: 1,
        currentGame: "limbo",
        recoveryStatus: "DISABLED",
        
        // BETTING PHASE SYSTEM
        bettingPhase: 1, // 1, 2, or 3
        initialBalance: 0, // BALANCE AWAL DARI PHASE 1
        phaseStartBalance: 0, // BALANCE SAAT MASUK PHASE TERTENTU
        
        // BACCARAT RECOVERY MODE (Phase 3)
        recoveryMode: false,
        recoveryStartBalance: 0,
        recoveryLossAmount: 0,
        recoveryAttempts: 0,
        recoverySide: "player",
        recoveryLastWinner: null,
        recoveryConsecutiveLosses: 0,
        recoveryFibonacci: [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610],
        recoveryFibonacciIndex: 0,
        recoveryLastResults: [],
        recoveryTrendMode: "follow",
        recoveryBaseBet: 0.0001, // 0.01% from balance
        
        // Baccarat display
        baccaratCards: {
            player: [],
            banker: [],
            winner: null
        },
        
        // Price cache
        idrPrice: 0,
        lastPriceFetch: 0,
        priceSymbol: "USDT"
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
            if (coin === "usdt") coin = "usdt";

            try {
                try {
                    return await this._direct_fetch(coin);
                } catch (e) {
                    console.log("Direct fetch failed, trying proxy...");
                }

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
            
            return rates[coin] || 15000;
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
                        updateIdrPrice();
                    }
                    const active = bals.find(b => b.available.currency === bot.selectedCurrency);
                    bot.stats.startBal = active ? parseFloat(active.available.amount) : 0;
                    bot.initialBalance = bot.stats.startBal; // SET INITIAL BALANCE
                    bot.phaseStartBalance = bot.stats.startBal;
                }
            } catch (e) { 
                bot.lastError = "Sync Failed"; 
                console.error("Sync error:", e);
            }
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
            
            let phaseIcon = bot.bettingPhase === 1 ? "🔥" : (bot.bettingPhase === 2 ? "⚡" : "🃏");
            let phaseText = bot.bettingPhase === 1 ? "WAGER BURN" : (bot.bettingPhase === 2 ? "MID RISK" : "BACCARAT");
            
            let gameInfo = "";
            if (bot.bettingPhase === 3) {
                gameInfo = `🎮 *Phase 3:* BACCARAT (${bot.recoverySide.toUpperCase()}) | Fib Step ${bot.recoveryFibonacciIndex+1}/${bot.recoveryFibonacci[bot.recoveryFibonacciIndex]}x | Trend: ${bot.recoveryTrendMode.toUpperCase()}`;
            } else {
                gameInfo = `🎮 *Phase ${bot.bettingPhase}:* ${phaseText} | Game: ${bot.currentGame.toUpperCase()}`;
            }
            
            // Hitung total loss dari balance awal (initialBalance)
            const totalLossPct = ((bot.initialBalance - currentBalance) / bot.initialBalance * 100).toFixed(2);
            
            const text = 
`🔷 *ORION v1 PREMIUM* 🔷
${statusHeader}

👤 *User:* \`${bot.stakeUser}\`
🪙 *Asset:* \`${bot.selectedCurrency.toUpperCase()}\`
💵 *IDR Price:* \`Rp ${bot.idrPrice.toLocaleString()}\`
${phaseIcon} *Phase:* \`${bot.bettingPhase} - ${phaseText}\`
📉 *Total Loss %:* \`${totalLossPct}%\`
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
        if (now - bot.lastPriceFetch < 300 && bot.idrPrice > 0) return bot.idrPrice;
        
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

    // GET CURRENT BALANCE
    function getCurrentBalance() {
        return bot.stats.startBal + bot.stats.profit;
    }

    // CALCULATE TOTAL LOSS PERCENTAGE FROM INITIAL BALANCE
    function getTotalLossPercentage() {
        const currentBalance = getCurrentBalance();
        return ((bot.initialBalance - currentBalance) / bot.initialBalance) * 100;
    }

    // CALCULATE LOSS PERCENTAGE FROM PHASE START (untuk transisi antar phase)
    function getPhaseLossPercentage() {
        const currentBalance = getCurrentBalance();
        return ((bot.phaseStartBalance - currentBalance) / bot.phaseStartBalance) * 100;
    }

    // CHECK AND UPDATE BETTING PHASE
    function updateBettingPhase() {
        const totalLossPct = getTotalLossPercentage();
        const phaseLossPct = getPhaseLossPercentage();
        
        console.log(`[PHASE CHECK] Total Loss: ${totalLossPct.toFixed(4)}%, Phase Loss: ${phaseLossPct.toFixed(4)}%, Current Phase: ${bot.bettingPhase}`);
        
        // Phase 1 to Phase 2: total loss > 0.2%
        if (bot.bettingPhase === 1 && totalLossPct > 0.2) {
            bot.bettingPhase = 2;
            bot.currentGame = "dice";
            bot.phaseStartBalance = getCurrentBalance(); // Reset phase start balance untuk tracking loss di phase 2
            console.log(`⚡ Phase 2 ACTIVATED! Total Loss: ${totalLossPct.toFixed(2)}%`);
            API.sendTg(`⚡ *PHASE 2 ACTIVATED* ⚡\nTotal Loss: ${totalLossPct.toFixed(2)}%`);
            return true;
        }
        
        // Phase 2 to Phase 3: total loss > 0.5%
        if (bot.bettingPhase === 2 && totalLossPct > 0.5) {
            bot.bettingPhase = 3;
            bot.recoveryMode = true;
            bot.recoveryFibonacciIndex = 0;
            bot.recoverySide = getBaccaratSide();
            bot.recoveryBaseBet = bot.phaseStartBalance * 0.0001; // 0.01% dari balance saat masuk phase 3
            bot.recoveryConsecutiveLosses = 0;
            bot.recoveryTrendMode = "follow";
            console.log(`🃏 Phase 3 (BACCARAT) ACTIVATED! Total Loss: ${totalLossPct.toFixed(2)}%`);
            API.sendTg(`🃏 *PHASE 3 ACTIVATED* 🃏\nTotal Loss: ${totalLossPct.toFixed(2)}%\nSwitching to BACCARAT with Fibonacci progression`);
            return true;
        }
        
        // Phase 3 to Phase 2: total loss <= 0.4%
        if (bot.bettingPhase === 3 && totalLossPct <= 0.4) {
            bot.bettingPhase = 2;
            bot.recoveryMode = false;
            bot.currentGame = "dice";
            bot.recoveryFibonacciIndex = 0;
            bot.recoveryConsecutiveLosses = 0;
            bot.phaseStartBalance = getCurrentBalance();
            console.log(`⚡ Phase 2 ACTIVATED! Total Loss recovered to: ${totalLossPct.toFixed(2)}%`);
            API.sendTg(`⚡ *BACK TO PHASE 2* ⚡\nTotal Loss: ${totalLossPct.toFixed(2)}%`);
            return true;
        }
        
        // Phase 2 to Phase 1: total loss <= 0.15%
        if (bot.bettingPhase === 2 && totalLossPct <= 0.15) {
            bot.bettingPhase = 1;
            bot.currentGame = "limbo";
            bot.phaseStartBalance = getCurrentBalance();
            console.log(`🔥 Phase 1 (WAGER BURN) ACTIVATED! Total Loss: ${totalLossPct.toFixed(2)}%`);
            API.sendTg(`🔥 *BACK TO PHASE 1* 🔥\nTotal Loss: ${totalLossPct.toFixed(2)}%`);
            return true;
        }
        
        return false;
    }

    // GET BACCARAT SIDE BASED ON TREND
    function getBaccaratSide() {
        if (bot.recoveryLastResults.length > 3) {
            const recentResults = bot.recoveryLastResults.slice(-5);
            const playerWins = recentResults.filter(r => r === "player").length;
            const bankerWins = recentResults.filter(r => r === "banker").length;
            if (playerWins > bankerWins) return "player";
            if (bankerWins > playerWins) return "banker";
        }
        return Math.random() < 0.5 ? "player" : "banker";
    }

    // GET FIBONACCI BET MULTIPLIER
    function getFibonacciMultiplier() {
        const index = Math.min(bot.recoveryFibonacciIndex, bot.recoveryFibonacci.length - 1);
        return bot.recoveryFibonacci[index];
    }

    // CALCULATE BACCARAT BET (Phase 3)
    function calculateBaccaratBet() {
        const multiplier = getFibonacciMultiplier();
        return bot.recoveryBaseBet * multiplier;
    }

    // PROCESS BACCARAT BET RESULT
    function processBaccaratResult(betResult, betSide, betAmount) {
        const state = betResult.state || {};
        const result = state.result || "unknown";
        const payout = betResult.payout || 0;
        const pnl = payout - betAmount;
        
        parseBaccaratCards(betResult);
        
        const isWin = (result === betSide);
        const isTie = (result === "tie");
        
        bot.stats.bets++;
        bot.stats.wagered += betAmount;
        
        if (isWin) {
            bot.stats.wins++;
            bot.recoveryLastWinner = betSide;
            // Reset Fibonacci index on win (move back 2 steps)
            bot.recoveryFibonacciIndex = Math.max(0, bot.recoveryFibonacciIndex - 2);
            if (bot.recoveryFibonacciIndex < 0) bot.recoveryFibonacciIndex = 0;
        } else if (isTie) {
            bot.stats.ties = (bot.stats.ties || 0) + 1;
            // No change on tie
        } else {
            bot.stats.loss++;
            bot.recoveryFibonacciIndex = Math.min(bot.recoveryFibonacciIndex + 1, bot.recoveryFibonacci.length - 1);
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

    // CALCULATE PHASE 1 BET (WAGER BURN)
    function calculatePhase1Bet() {
        const currentBalance = getCurrentBalance();
        // Random base bet between 0.1% - 0.5% of current balance
        const randomPercent = 0.001 + (Math.random() * 0.004);
        return currentBalance * randomPercent;
    }

    // CALCULATE PHASE 2 BET
    function calculatePhase2Bet() {
        const currentBalance = getCurrentBalance();
        // 0.061% of current balance
        return currentBalance * 0.00061;
    }

    // GET PHASE 1 GAME AND PAYOUT
    function getPhase1GameAndPayout() {
        const cycleCounter = bot.switchCounter % 7;
        if (cycleCounter < 5) {
            // Dice chance 99.98% (payout = 100/99.98 ≈ 1.0002)
            return { game: "dice", payout: 100 / 99.98 };
        } else {
            // Limbo payout 1.0001
            return { game: "limbo", payout: 1.0001 };
        }
    }

    // GET PHASE 2 GAME AND PAYOUT
    function getPhase2GameAndPayout() {
        const cycleCounter = bot.switchCounter % 5;
        if (cycleCounter < 3) {
            // Dice chance 49.5% (payout = 100/49.5 ≈ 2.0202)
            return { game: "dice", payout: 100 / 49.5 };
        } else {
            // Limbo payout 2
            return { game: "limbo", payout: 2 };
        }
    }

    async function runLoop() {
        if (!bot.isRunning) return;
        
        // Update IDR price periodically
        updateIdrPrice();
        
        // Check and update betting phase based on loss percentage
        updateBettingPhase();
        
        // Update status text
        if (bot.bettingPhase === 1) {
            bot.currentStatus = `PHASE 1 - WAGER BURN`;
        } else if (bot.bettingPhase === 2) {
            bot.currentStatus = `PHASE 2 - MID RISK`;
        } else {
            bot.currentStatus = `PHASE 3 - BACCARAT RECOVERY`;
        }
        
        let payout, nextbet, gameToPlay;
        
        // PHASE 3 - BACCARAT
        if (bot.bettingPhase === 3) {
            gameToPlay = "baccarat";
            
            const side = getBaccaratSide();
            bot.recoverySide = side;
            
            nextbet = calculateBaccaratBet();
            
            bot.currentStatus = `PHASE 3 (${side} | Fib ${getFibonacciMultiplier()}x)`;
            
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
                    console.log(`Phase 3 Baccarat ${side} -> ${result} | PnL: ${pnl.toFixed(8)} | Fib: ${getFibonacciMultiplier()}x`);
                }
                
                if (bot.isRunning) {
                    setTimeout(runLoop, 0);
                }
                
            } catch (e) { 
                bot.lastError = "Network Error"; 
                if (bot.isRunning) setTimeout(runLoop, 1000); 
            }
        }
        
        // PHASE 1 - WAGER BURN
        else if (bot.bettingPhase === 1) {
            const gameConfig = getPhase1GameAndPayout();
            gameToPlay = gameConfig.game;
            payout = gameConfig.payout;
            nextbet = calculatePhase1Bet();
            
            bot.switchCounter++;
            if (bot.switchCounter >= 7) bot.switchCounter = 0;
            
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
        
        // PHASE 2 - MID RISK
        else if (bot.bettingPhase === 2) {
            const gameConfig = getPhase2GameAndPayout();
            gameToPlay = gameConfig.game;
            payout = gameConfig.payout;
            nextbet = calculatePhase2Bet();
            
            bot.switchCounter++;
            if (bot.switchCounter >= 5) bot.switchCounter = 0;
            
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
        z-index: 99999;
        padding: 18px;
        border-radius: 24px;
        color: #eaf2ff;
        font-size: 13px;
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background:
            radial-gradient(circle at top right, rgba(61, 153, 255, 0.08), transparent 28%),
            radial-gradient(circle at top left, rgba(28, 116, 208, 0.10), transparent 26%),
            linear-gradient(180deg, rgba(24, 44, 60, 0.98) 0%, rgba(17, 36, 49, 0.99) 100%);
        border: 1px solid rgba(88, 124, 160, 0.20);
        box-shadow:
            0 24px 60px rgba(0, 0, 0, 0.52),
            inset 0 1px 0 rgba(255, 255, 255, 0.04),
            0 0 0 1px rgba(70, 130, 180, 0.03);
        backdrop-filter: blur(14px);
        scrollbar-width: thin;
        scrollbar-color: rgba(115, 140, 170, 0.65) transparent;
    }

    #orion-wrap::-webkit-scrollbar {
        width: 6px;
    }

    #orion-wrap::-webkit-scrollbar-track {
        background: transparent;
    }

    #orion-wrap::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, rgba(95, 115, 140, 0.95), rgba(55, 70, 90, 0.95));
        border-radius: 999px;
    }

    .orion-header {
        text-align: center;
        margin-bottom: 18px;
    }

    .orion-title {
        font-weight: 800;
        font-size: 20px;
        letter-spacing: 0.4px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        color: #f8fbff;
        text-shadow: 0 2px 10px rgba(0,0,0,0.2);
    }

    .orion-title span {
        color: #ffbf47;
        font-size: 20px;
        line-height: 1;
    }

    .orion-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-top: 8px;
        padding: 7px 16px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.4px;
        color: #f1f5f9;
        background: linear-gradient(180deg, #173042 0%, #102433 100%);
        border: 1px solid rgba(88, 124, 160, 0.18);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
    }

    .orion-user {
        margin: 10px 0 8px;
        padding: 12px 14px;
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(17, 40, 56, 0.96), rgba(13, 31, 43, 0.98));
        border: 1px solid rgba(76, 110, 142, 0.18);
        color: #e2ebf5;
        font-size: 12px;
        font-weight: 700;
        word-break: break-word;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
    }

    .orion-price {
        margin: 10px 0 14px;
        padding: 14px 16px;
        border-radius: 18px;
        text-align: center;
        font-size: 12px;
        font-weight: 800;
        color: #ffd166;
        background: linear-gradient(180deg, rgba(36, 82, 128, 0.95), rgba(31, 72, 112, 0.98));
        border: 1px solid rgba(56, 130, 210, 0.35);
        box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.04),
            0 8px 20px rgba(0,0,0,0.12);
    }

    .orion-section {
        margin-bottom: 14px;
        padding: 16px;
        border-radius: 22px;
        background: linear-gradient(90deg, rgba(15, 36, 50, 0.98) 0%, rgba(21, 49, 66, 0.98) 100%);
        border: 1px solid rgba(72, 104, 136, 0.18);
        box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.03),
            0 10px 24px rgba(0,0,0,0.12);
    }

    .orion-section-title {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 14px;
        color: #f4f8fc;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.5px;
        text-transform: uppercase;
    }

    .orion-section-title span {
        color: #d8c8ff;
    }

    .orion-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
    }

    .orion-input-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .orion-input-group label {
        font-size: 10px;
        font-weight: 700;
        color: #aab8c8;
        text-transform: uppercase;
        letter-spacing: 0.35px;
    }

    .orion-input,
.orion-select {
    width: 100%;
    box-sizing: border-box;
    padding: 14px 14px;
    border-radius: 16px;
    border: 1px solid rgba(73, 113, 150, 0.55);
    background: linear-gradient(180deg, #0a2130 0%, #09202d 100%);
    color: #f7fbff;
    font-size: 13px;
    font-weight: 700;
    font-family: "SF Mono", Monaco, "Cascadia Code", monospace;
    outline: none;
    transition: all 0.18s ease;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.02);
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
}

/* fundo da lista aberta */
.orion-select option {
    background: #0d2230;
    color: #f7fbff;
}

/* item selecionado */
.orion-select option:checked {
    background: #2f7fe6;
    color: #ffffff;
}

/* alguns navegadores aceitam hover */
.orion-select option:hover {
    background: #2468be;
    color: #ffffff;
}

.orion-input::placeholder {
    color: #7f96ab;
}

.orion-input:focus,
.orion-select:focus {
    border-color: #3ea6ff;
    box-shadow: 0 0 0 3px rgba(62, 166, 255, 0.14);
}

    .orion-stats {
        margin-bottom: 14px;
        padding: 16px;
        border-radius: 22px;
        background: linear-gradient(90deg, rgba(15, 36, 50, 0.98) 0%, rgba(21, 49, 66, 0.98) 100%);
        border: 1px solid rgba(72, 104, 136, 0.18);
        box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.03),
            0 10px 24px rgba(0,0,0,0.12);
    }

    .orion-stat-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid rgba(86, 108, 130, 0.22);
    }

    .orion-stat-row:last-child {
        border-bottom: none;
    }

    .orion-stat-label {
        color: #aab8c8;
        font-weight: 700;
        letter-spacing: 0.15px;
    }

    .orion-stat-value {
        color: #f8fbff;
        font-weight: 800;
        font-family: "SF Mono", Monaco, monospace;
    }

    .orion-stat-value.positive {
        color: #4ade80;
    }

    .orion-stat-value.negative {
        color: #ff6b6b;
    }

    .orion-log {
        margin-top: 10px;
        padding: 12px 14px;
        border-radius: 16px;
        background: linear-gradient(180deg, #112534 0%, #0b1d2a 100%);
        border: 1px solid rgba(72, 104, 136, 0.18);
        color: #f8fbff;
        font-size: 11px;
        line-height: 1.45;
        word-break: break-word;
    }

    .orion-buttons {
        display: flex;
        gap: 12px;
        margin-top: 12px;
    }

    .orion-btn {
        flex: 1;
        padding: 15px 16px;
        border: none;
        border-radius: 18px;
        font-size: 13px;
        font-weight: 900;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.18s ease;
    }

    .orion-btn-start {
        color: #ffffff;
        background: linear-gradient(180deg, #3c92ff 0%, #2d79dd 100%);
        box-shadow:
            0 10px 24px rgba(45, 121, 221, 0.28),
            inset 0 1px 0 rgba(255,255,255,0.14);
    }

    .orion-btn-start:hover {
        transform: translateY(-1px);
        box-shadow:
            0 14px 28px rgba(45, 121, 221, 0.32),
            inset 0 1px 0 rgba(255,255,255,0.14);
    }

    .orion-btn-stop {
        color: #dce7f1;
        background: linear-gradient(180deg, #33485a 0%, #2a3d4e 100%);
        border: 1px solid rgba(108, 134, 156, 0.18);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
    }

    .orion-btn-stop:hover {
        transform: translateY(-1px);
        background: linear-gradient(180deg, #395063 0%, #304657 100%);
    }

    .phase-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.3px;
    }

    .phase-badge.phase1 {
        color: #fca5a5;
        background: rgba(239, 68, 68, 0.14);
        border: 1px solid rgba(239, 68, 68, 0.26);
    }

    .phase-badge.phase2 {
        color: #fde68a;
        background: rgba(245, 158, 11, 0.14);
        border: 1px solid rgba(245, 158, 11, 0.26);
    }

    .phase-badge.phase3 {
        color: #d8b4fe;
        background: rgba(168, 85, 247, 0.14);
        border: 1px solid rgba(168, 85, 247, 0.26);
    }

    .baccarat-display {
        margin-bottom: 14px;
        padding: 16px;
        border-radius: 22px;
        background: linear-gradient(90deg, rgba(15, 36, 50, 0.98) 0%, rgba(21, 49, 66, 0.98) 100%);
        border: 1px solid rgba(72, 104, 136, 0.18);
        box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.03),
            0 10px 24px rgba(0,0,0,0.12);
    }

    .baccarat-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 12px;
        background: rgba(8, 25, 36, 0.65);
        border: 1px solid rgba(72, 104, 136, 0.14);
        border-radius: 14px;
        margin-bottom: 8px;
    }

    .baccarat-label {
        font-size: 11px;
        font-weight: 800;
        color: #aab8c8;
        text-transform: uppercase;
    }

    .baccarat-cards {
        font-size: 14px;
        font-weight: 800;
        font-family: "SF Mono", Monaco, monospace;
        color: #f8fbff;
    }

    .baccarat-cards.player {
        color: #60a5fa;
    }

    .baccarat-cards.banker {
        color: #f87171;
    }

    .baccarat-winner {
        text-align: center;
        font-size: 13px;
        font-weight: 900;
        margin-top: 10px;
        padding: 10px 12px;
        background: rgba(51, 133, 222, 0.12);
        border-radius: 16px;
        border: 1px solid rgba(51, 133, 222, 0.20);
        color: #f8fbff;
    }

    @media (max-width: 480px) {
        #orion-wrap {
            top: 6px;
            right: 6px;
            width: calc(100vw - 12px);
            padding: 14px;
            border-radius: 18px;
        }

        .orion-title {
            font-size: 18px;
        }

        .orion-grid {
            gap: 10px;
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
        <div class="orion-badge">PREMIUM EDITION - 3 PHASE SYSTEM</div>
    </div>

    <div class="orion-user" id="st-user">
        Loading...
    </div>

    <div class="orion-price" id="st-idr-price">
        Loading price...
    </div>

    <div class="orion-section">
        <div class="orion-section-title">
            <span>✺</span> SYSTEM CONFIG
        </div>
        <div class="orion-grid">
            <div style="grid-column: span 2">
                <div class="orion-input-group">
                    <label>CURRENCY</label>
                    <select id="p-currency" class="orion-select"></select>
                </div>
            </div>
        </div>
    </div>

    <div class="orion-stats">
        <div class="orion-stat-row">
            <span class="orion-stat-label">TIME</span>
            <span class="orion-stat-value" id="st-time">00:00:00</span>
        </div>
        <div class="orion-stat-row">
            <span class="orion-stat-label">STATUS</span>
            <span class="orion-stat-value" id="st-status" style="color: #3ea6ff">IDLE</span>
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
            <span class="orion-stat-value" style="color: #ff6b6b" id="st-dd">0.00000000</span>
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
        <div class="orion-stat-row">
            <span class="orion-stat-label">PHASE</span>
            <span class="orion-stat-value" id="st-phase">1 - WAGER BURN</span>
        </div>
        <div class="orion-stat-row">
            <span class="orion-stat-label">TOTAL LOSS %</span>
            <span class="orion-stat-value" id="st-loss-pct">0.00%</span>
        </div>
    </div>

    <div class="baccarat-display" id="baccarat-display" style="display: none;">
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

    <div class="orion-log" id="st-log">
        None
    </div>

    <div class="orion-buttons">
        <button id="p-start" class="orion-btn orion-btn-start">START</button>
        <button id="p-stop" class="orion-btn orion-btn-stop">STOP</button>
    </div>
`;

document.body.appendChild(d);
        
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
                bot.bettingPhase = 1;
                bot.initialBalance = bot.stats.startBal; // SET INITIAL BALANCE
                bot.phaseStartBalance = bot.stats.startBal;
                bot.currentGame = "limbo";
                
                // Reset recovery variables
                bot.recoveryMode = false;
                bot.recoveryFibonacciIndex = 0;
                bot.recoveryLastResults = [];
                bot.baccaratCards = { player: [], banker: [], winner: null };
                
                setTimeout(() => API.sendTg("🚀 *SYSTEM ENGAGED - 3 PHASE SYSTEM* 🚀\nPhase 1: WAGER BURN"), 1000);
                
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
        
        const totalLossPct = getTotalLossPercentage();
        let statusText = "";
        if (bot.bettingPhase === 1) {
            statusText = `PHASE 1 - WAGER BURN (${bot.currentGame})`;
        } else if (bot.bettingPhase === 2) {
            statusText = `PHASE 2 - MID RISK (${bot.currentGame})`;
        } else {
            const fibMultiplier = getFibonacciMultiplier();
            statusText = `PHASE 3 - BACCARAT (${bot.recoverySide} | Fib ${fibMultiplier}x)`;
        }
        document.getElementById("st-status").innerText = statusText;
        
        // Show/hide baccarat display based on phase
        const baccaratDisplay = document.getElementById("baccarat-display");
        if (baccaratDisplay) {
            baccaratDisplay.style.display = bot.bettingPhase === 3 ? "block" : "none";
        }
        
        document.getElementById("st-startbal").innerText = getCurrentBalance().toFixed(8);
        document.getElementById("st-profit").innerText = bot.stats.profit.toFixed(8);
        document.getElementById("st-wager").innerText = bot.stats.wagered.toFixed(8);
        document.getElementById("st-dd").innerText = bot.stats.maxDD.toFixed(8);
        document.getElementById("st-bets").innerText = bot.stats.bets;
        document.getElementById("st-wl").innerText = `${bot.stats.wins}/${bot.stats.loss}`;
        document.getElementById("st-speed").innerText = bot.startTime ? (bot.stats.bets / ((new Date() - bot.startTime) / 1000 || 1)).toFixed(2) + " b/s" : "0 b/s";
        
        const phaseText = bot.bettingPhase === 1 ? "1 - WAGER BURN" : (bot.bettingPhase === 2 ? "2 - MID RISK" : "3 - BACCARAT");
        document.getElementById("st-phase").innerText = phaseText;
        document.getElementById("st-loss-pct").innerText = totalLossPct.toFixed(2) + "%";
        document.getElementById("st-log").innerText = bot.lastError;
        
        // Color coding for loss percentage
        const lossPctEl = document.getElementById("st-loss-pct");
        if (totalLossPct > 0.5) {
            lossPctEl.style.color = "#F87171";
        } else if (totalLossPct > 0.2) {
            lossPctEl.style.color = "#FBBF24";
        } else {
            lossPctEl.style.color = "#4ADE80";
        }
    }, 400);

    createUI(); 
    API.syncOnce();
    
    // Initial price update
    setTimeout(updateIdrPrice, 2000);
})();
