let waxid;
let nonce;
let delay;
let wax;
let enableBoostCpu = false;
let boostAccount;
let rpcEndpoint = "https://wax.greymass.com";
// https://api.waxsweden.org

function setEndpoint(ep) {
    rpcEndpoint = ep;
}

function setNonce(n, d = 0) {
    nonce = n;
    if (d > 100) {
        delay = d;
        document.querySelector('#delay').innerText = '' + delay
    }
    else {
        prepareData()
            .then(r => {
                document.querySelector('#delay').innerText = '' + r
                delay = r
            })
            .catch(e => {
                document.querySelector('#delay').innerText = '500'
                delay = 500
            })
    }
}

function createWax(_boostAccount = null, _privateKey = null) {
    const params = {
        rpcEndpoint: rpcEndpoint,
        freeBandwidth: true,
        cosigns: [
            {
                actor: "yeomenwarder",
                permission: "guard"
            }
        ]
    };

    if (_boostAccount && _privateKey) {
        enableBoostCpu = true;
        boostAccount = _boostAccount;
        params.jsSignatureProvider = new eosjs_jssig.default([_privateKey]);
    }

    // create wax instance
    wax = new waxjs.WaxJS(params);
}

function createWaxWithPubKeys(wallet, pubKeys, ep = "https://api.wax.alohaeos.com", paybw = null) {
    const params = {
        rpcEndpoint: ep,
        freeBandwidth: true,
        pubKeys: pubKeys,
        userAccount: wallet,
        cosigns: [
            {
                actor: "yeomenwarder",
                permission: "guard"
            }
        ]
    };

    if (paybw) {
        enableBoostCpu = true;
        boostAccount = paybw.wallet;
        params.jsSignatureProvider = new eosjs_jssig.default([paybw.privateKey]);
    }

    wax = new waxjs.WaxJS(params);
    login();
}

async function login() {
    if (! wax) {
        createWax();
    }

    try {
        const userAccount = await wax.login();
        document.getElementById("waxid").innerText = userAccount;
        waxid = userAccount;
        document.getElementById("login").disabled = true
    } catch (e) {
        document.getElementById("waxid").innerText = e.message;
    }
}

async function getLastTx() {
    return axios.get('https://waxgame.net/api/get_lastmine/' + waxid).then(res => {
        if (res.data.rows && res.data.rows.length === 0)
            return null;

        return res.data.rows[0].last_mine_tx;
    })
}

async function calcNonce() {
    document.getElementById("mine").disabled = true
    document.getElementById("claim").disabled = true
    document.querySelector('#result').innerText = ''
    const tx = await getLastTx();
    if (!tx) {
        nonce = "MINER_NOT_FOUND";
        document.querySelector("#nonce").innerText = "MINER_NOT_FOUND";
        document.getElementById("claim").disabled = false;
        throw Error("Account doesnt register");
    }

    new Promise(r => r(GenerateNonce(waxid, waxid, 0, tx)))
        .then(r => {
            nonce = r.rand_str
            document.querySelector("#nonce").innerText = nonce + ""
            console.log('nonce', nonce)
            document.getElementById("claim").disabled = false;
        });
}

async function prepareData() {
    const data = await Promise.all([
        axios.get(`https://waxgame.net/api/get_table_rows/${waxid}/miners`),
        axios.get(`https://waxgame.net/api/get_table_rows/${waxid}/bags`)
    ])

    if (data[0].data.rows.length * data[1].data.rows.length === 0)
        throw -1

    const bags = data[1].data.rows[0].items
    const miners = data[0].data.rows[0]

    const procs = [
        axios.get(`https://waxgame.net/api/atomicassets/${miners.current_land}`)
    ]

    for(const itemid of bags) {
        procs.push(axios.get(`https://waxgame.net/api/atomicassets/${itemid}`))
    }

    const itemsData = await Promise.all(procs)

    const landMulti = itemsData[0].data.data.data.delay / 10
    const landDifficulty = itemsData[0].data.data.data.difficulty

    itemsData.shift()
    const calc = itemsData.reduce((a, o) => {
        a.delay.push(o.data.data.data.delay)
        a.difficulty += o.data.data.data.difficulty

        return a
    }, {delay: [], difficulty: 0})

    calc.delay.sort((a,b) => Number(a) - Number(b))

    if (calc.delay.length >= 3) calc.delay.shift()
    const toolsDelay = calc.delay.reduce((a,b) => a + b, 0)

    return {
        ...miners,
        bags,
        delay: landMulti * toolsDelay,
        difficulty: landDifficulty * calc.difficulty
    }
}

async function makeTransaction(action, data, permission = "active") {
    if (! waxid) {
        document.querySelector('#result').innerText = '[Finished] - Error - Login first'
        return
    }
    document.querySelector('#result').innerText = ''

    // action = { account: "m.federation", name: "setbag"}

    wax.api.transact({
        actions: [{
            ...action,
            authorization: [{
                actor: waxid,
                permission: permission
            }],
            data: data
        }]
    }, {
        blocksBehind: 3,
        expireSeconds: 1200
    })
    .then(r => {
        console.log(r)
        document.querySelector('#result').innerText = '[Finished] - Successful - Transaction id ' + r.transaction_id
    })
    .catch(e => {
        console.error(e)
        document.querySelector('#result').innerText = '[Finished] - Error - ' + e.message
    })
}

async function transact(actions) {
    if (! waxid) {
        document.querySelector('#result').innerText = '[Finished] - Error - Login first'
        return
    }

    document.querySelector('#result').innerText = ''

    actions = actions.map(r => {
        if (! r.hasOwnProperty('authorization')) {
            r.authorization = [{
                actor: waxid,
                permission: 'active'
            }]
        }

        return r
    })

    wax.api.transact({
        actions: actions
    }, {
        blocksBehind: 3,
        expireSeconds: 1200
    })
    .then(r => {
        console.log(r)
        document.querySelector('#result').innerText = '[Finished] - Successful - Transaction id ' + r.transaction_id
    })
    .catch(e => {
        console.error(e)
        document.querySelector('#result').innerText = '[Finished] - Error - ' + e.message
    })
}

async function mine() {
    if (! waxid) {
        document.querySelector('#result').innerText = '[Finished] - Error - Login first'
        return
    }

    document.getElementById("mine").disabled = true
    document.getElementById("claim").disabled = true
    console.log('MINE')
    document.querySelector('#result').innerText = ''

    if (! nonce) {
        let maxTries = 10
        let tries = 0
        let minerInfo
        while(! minerInfo && ++tries < maxTries) {
            try{
                minerInfo = await prepareData()
            }
            catch (e) {
                if (e === -1) {
                    document.querySelector('#result').innerText = '[Finished] - Error - Invalid Account'
                    document.getElementById("mine").disabled = false
                    document.getElementById("claim").disabled = false
                    return
                }
            }
        }

        delay = minerInfo.delay
        const remains = moment(minerInfo.last_mine + '.000Z').add(delay, 'seconds').diff(new Date(), 'seconds')
        console.log('remains', remains)
        document.querySelector('#delay').innerText = '' + delay

        if (remains > 0) {
            document.querySelector('#result').innerText = '[Finished] - Error - Mine too soon'
            document.getElementById("mine").disabled = false
            document.getElementById("claim").disabled = false
            document.getElementById("next-claim").innerText = '' + remains
            return
        }

        nonce = GenerateNonce(waxid, waxid, minerInfo.difficulty, minerInfo.last_mine_tx).rand_str
        document.querySelector("#nonce").innerText = nonce + ""
    }

    console.log('nonce', nonce)
    document.getElementById("claim").disabled = false
}

function claim() {
    document.getElementById("claim").disabled = true
    document.querySelector('#result').innerText = ''
    const actions = [{
        account: "m.federation",
        name: "mine",
        authorization: [{
            actor: waxid,
            permission: "active"
        }],
        data: {
            miner: waxid,
            nonce: nonce
        }
    }];

    if (enableBoostCpu && boostAccount) {
        actions.unshift({
            account: "boost.wax",
            name: "noop",
            authorization: [{
                actor: boostAccount,
                permission: "active"
            }],
            data: null
        });
    }

    wax.api.transact({
        actions
    }, {
        blocksBehind: 3,
        expireSeconds: 1200
    })
    .then(r => {
        nonce = null
        console.log(r)
        document.querySelector('#result').innerText = '[Finished] - Successful - Transaction id ' + r.transaction_id
        document.getElementById("claim").disabled = true
        document.getElementById("mine").disabled = false
    })
    .catch(e => {
        console.error(e)
        document.querySelector('#result').innerText = '[Finished] - Error - ' + e.message
        document.getElementById("claim").disabled = false
    })
}

function gkTransact(actions, type) {
    wax.api.transact({
        actions
    }, {
        blocksBehind: 3,
        expireSeconds: 1200
    })
    .then(r => {
        emitMessageEvent(`TRANSACT;${type};Successful;${r.transaction_id}`);
    })
    .catch(e => {
        emitMessageEvent(`TRANSACT;${type};Error;${e.message}`);
    });
}
