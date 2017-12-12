"use strict"
const fs = require("fs");
const puppeteer = require("puppeteer");// メインディッシュ
const prompt = require("prompt");// 入力受付に使う
const sanitize = require("sanitize-filename");// ファイル名をつくるのに使う

let fileNameTemplate = "$ID-$NAME";

const WAIT_MAX_NUM = 10;
const WAIT_INTERVAL = 200;


(async () => {

    // puppeteer起動！！！
    const browser = await puppeteer.launch({
        headless: true,
        userDataDir: __dirname + "/UserData"// User Dataのディレクトリを設定(これ重要)
    });
    // ページを用意
    const page = await browser.newPage();
    const myPageUrl = "http://www.nicovideo.jp/my/mylist";

    console.log("Login checking...");

    // ログイン確認
    await page.goto(myPageUrl);

    // userIdの取得ループ
    let userId;
    for (let i=0; i < WAIT_MAX_NUM && !userId; i++) {
        if (i > 0) await page.waitFor(WAIT_INTERVAL);
        userId = await page.evaluate(() => {
            if (typeof(userId) == "undefined" || !userId) return;
            return userId;
        });
    }

    // ログインできていなければログイン処理
    let loginResult;
    if (await page.url() != myPageUrl || !userId) {
        // メールアドレスとパスワードの入力待ち
        const inputResult = await inputMailAndPass();
        const loginMailtel = inputResult.mail;
        const loginPassword = inputResult.password;

        loginResult = await login(page, loginMailtel, loginPassword);
    } else {// ログイン済みであれば何もせずtrue
        loginResult = true;
    }

    // ログインに失敗したら終了
    if (!loginResult) {
        console.error("Login failed.");
        await browser.close();
        return;
    }

    console.log("Login success.");
    
    // マイリスト一覧を取得
    var mylists = await getMylistGroups(page);
    if (!mylists) {
        console.error("getMylistGroups() failed.");
        await browser.close();
        return;
    }
    console.log("getMylistGroups() success.");

    // マイリストを順番に取得
    for (let i=0; i < mylists.length; i++) {
        if (i > 0) await page.waitFor(3000);
        var mylist = await getMylist(page, mylists[i].id);
        if (!mylist) continue;
        var filename = generateFileName(mylist.data);
        fs.writeFileSync("./mylists/"+filename,
            JSON.stringify(mylist, null, "    "));
        console.log("getMylist() success:", filename);
    }

    console.log("Backup completed!!!");
    
    await browser.close();
    return;
})();


/**
 * メールアドレスとパスワードの入力受付
 */
async function inputMailAndPass() {
    var scheme = {
        properties: {
            mail: {
                message: "Mail or TEL"
            },
            password: {
                message: "Password",
                hidden: true
            }
        }
    }
    return new Promise((resolve, reject) => {
        prompt.get(scheme, (err, res) => {
            if (err) {
                reject(err);
                return;
            }
            resolve({
                mail: res.mail,
                password: res.password
            });
        });
    });
}

/**
 * マイリスト保存時のファイル名を生成する
 * @param {string} mylistData マイリスト情報
 * @returns {string} ファイル名
 */
function generateFileName(mylistData) {
    var tmp = fileNameTemplate || "$ID-$NAME";
    tmp = tmp.replace(/\$ID/g, mylistData.id);
    tmp = tmp.replace(/\$NAME/g, mylistData.name);

    return sanitize(tmp)+".json";
}


/**
 * ログイン処理
 * @param {puppeteer.page} page ログインに使うページ
 * @param {string} loginMailtel ログインに使うメールアドレスor電話番号
 * @param {string} loginPassword ログインに使うパスワード
 * @returns {boolean} ログインに成功したかどうか
 */
async function login(page, loginMailtel, loginPassword) {
    const loginUrl = "https://account.nicovideo.jp/login";
    if ((await page.url()).split("?")[0] != loginUrl) {
        await page.goto(loginUrl);
    }

    // メールアドレスとパスワードを入力
    await page.type("#input__mailtel", loginMailtel);
    await page.type("#input__password", loginPassword);
    // ログインボタンをクリック(リダイレクトで待機するのでここでは待機しない)
    page.click("#login__submit");

    // リダイレクトを待つ
    await page.waitForNavigation();

    // ログインページ以外にリダイレクト & userIdが定義されていれば成功
    const nowUrl = await page.url();
    let userId;
    for (let i=0; i < WAIT_MAX_NUM && !userId; i++) {
        if (i > 0) await page.waitFor(WAIT_INTERVAL);
        userId = await page.evaluate(() => {
            if (typeof(userId) == "undefined" || !userId) return;
            return userId;
        });
    }
    return !nowUrl.match("login") && userId;
}

/**
 * マイリスト一覧を取得する
 * @param {puppeteer.page} page 取得に使うページ
 * @returns {array} マイリスト一覧
 */
async function getMylistGroups(page) {
    const myPageUrl = "http://www.nicovideo.jp/my/mylist";
    if (await page.url() != myPageUrl) {
        await page.goto(myPageUrl);
    }

    let groups;
    for (let i=0; i < WAIT_MAX_NUM; i++) {
        if (i > 0) await page.waitFor(WAIT_INTERVAL);
        groups = await page.evaluate(() => {
            if (typeof(my) == "undefined") return;
            return my.groups;
        });
    }
    if (!Array.isArray(groups)) {
        return [];
    }
    groups.unshift({
        id: "deflist",
        name: "とりあえずマイリスト"
    });
    
    return groups
}

/**
 * マイリストを取得する
 * @param {puppeteer.page} page 取得に使うページ
 * @param {string} mylistId マイリストID (とりあえずマイリストの場合はdeflist)
 */
async function getMylist(page, mylistId) {
    var pageUrl = "http://www.nicovideo.jp/mylist/"+mylistId;
    if (mylistId == "deflist") {
        pageUrl = "http://www.nicovideo.jp/my/mylist/#/home";
    }
        
    if (await page.url() != pageUrl) {
        await page.goto(pageUrl);
    }

    var rawItems;
    for (let i=0; i < WAIT_MAX_NUM && !rawItems; i++) {
        if (i > 0) await page.waitFor(WAIT_INTERVAL);
        rawItems = await page.evaluate(() => {
            if (typeof(my) == "undefined") return;
            return my.currentItems;
        });
    }
    var mylistData;
    if (mylistId == "deflist") {
        mylistData = {
            id: "deflist",
            name: "とりあえずマイリスト",
        }
    } else {
        for (let i=0; i < WAIT_MAX_NUM && !mylistData; i++) {
            if (i > 0) await page.waitFor(WAIT_INTERVAL);
            mylistData = await page.evaluate(() => {
                if (typeof(my) == "undefined") return;
                return my.currentGroup;
            });
        }
    }

    if (!Array.isArray(rawItems) || !mylistData) {
        return null;
    }

    var items = [];
    for (let i=0; i < rawItems.length; i++) {
        var rawItem = rawItems[i];
        var rawData = rawItem.item_data;
        if (!rawData || rawItem.item_type != 0) continue;
        var item = {
            // マイリストコメント？
            description: rawItem.description,
            // マイリストに登録した日時
            create_time: rawItem.create_time,
            // マイリストアイテムID？マイリストを編集するAPIで使うっぽい
            item_id: rawItem.item_id,
            // マイリストアイテムの更新日時 コメントを編集したときなどに変わる
            update_time: rawItem.update_time,
            // 動画情報
            item_data: {
                video_id: rawData.video_id,
                watch_id: rawData.watch_id,
                title: rawData.title,
                thumbnail_url: rawData.thumbnail_url,
                length_seconds: rawData.length_seconds
            }
        }
        items.push(item);
    }

    return {
        data: mylistData,
        items: items
    };
}
