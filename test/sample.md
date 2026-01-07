---
id: gemini_cf29fd5979da0c35
title: "Gemini のチャット記録を Obsidian へ残す方法はありませんか？"
source: gemini
url: https://gemini.google.com/app/cf29fd5979da0c35
created: 2026-01-06T12:18:16.131Z
modified: 2026-01-06T12:18:16.132Z
tags:
  - ai-conversation
  - gemini
message_count: 4
---

> [!QUESTION] User
> Gemini のチャット記録を Obsidian へ残す方法はありませんか？

> [!QUESTION] User
> Gemini のチャット記録を Obsidian へ残す方法はありませんか？

> [!QUESTION] User
> Gemini のチャット記録を Obsidian へ残す方法はありませんか？

> [!NOTE] Gemini
> ご希望の要件（自動連携、チャット形式の維持、1チャット1ファイル、継続的な更新）をすべて満たす既存の「完成された一般向けツール」は、現時点では存在しません。
> 
> しかし、**Obsidian Local REST API を既に導入されている**とのことですので、\*\*Tampermonkey などのユーザースクリプト（Userscript）\*\*を自作することで、この仕組みを比較的容易に構築できます。
> 
> 「開発することもいとわない」とのことですので、具体的なアーキテクチャと実装のプロトタイプを提案します。
> 
> * * *
> 
> ### 提案するアーキテクチャ
> 
> ブラウザ上で動作する Gemini の Web UI から、ローカルの Obsidian へデータを流し込む仕組みです。
> 
> 1.  **Tampermonkey (Userscript):** ブラウザ上で `gemini.google.com` を監視。
>     
> 2.  **DOM 解析:** チャットの更新（DOMの変化）を検知し、会話内容をMarkdown化。
>     
> 3.  **データ送信:** `GM_xmlhttpRequest` を使用して、Obsidian Local REST API (`localhost`) へ `PUT` リクエストを送信。
>     
> 4.  **Obsidian:** ファイルが作成・更新される。
>     
> 
> **フロー図:**
> 
> * * *
> 
> ### 実装のポイント
> 
> 要件を満たすための技術的なアプローチは以下の通りです。
> 
> 1.  **自動連携 (Observer):**
>     
>     -   `MutationObserver` を使い、チャットエリアのDOM変化を監視します。ただし、ストリーミング生成中は頻繁にイベントが発生するため、`debounce`（最後の変更から数秒待ってから実行）処理を入れて API への負荷とファイル書き込み回数を減らします。
>         
> 2.  **チャット形式 (Callouts):**
>     
>     -   Obsidian の標準機能である **Callouts (Admonitions)** を利用すると、視覚的にチャットっぽくなります。
>         
>     -   例: Userは `> [!Question]`, Geminiは `> [!Abstract]` など。
>         
> 3.  **1チャット → 1ファイル:**
>     
>     -   ファイル名は Gemini の URL に含まれる一意の ID (例: `app/12345` の `12345`)、またはチャットのタイトルを使用します。
>         
> 4.  **更新の追記:**
>     
>     -   Gemini は過去の回答を再生成したり、ユーザーがプロンプトを編集したりできるため、「追記」よりも\*\*「現在のDOM全体を取得してファイル全体を上書き保存」\*\*する方が整合性が取れます。Obsidian Local REST API の `PUT` メソッドでこれが可能です。
>         
> 
> * * *
> 
> ### プロトタイプ・スクリプト (Tampermonkey用)
> 
> 以下は、この機能を実装するためのベースとなるスクリプトです。Tampermonkey に新規スクリプトとして追加し、設定値を書き換えて試してみてください。
> 
> JavaScript
> 
> ```
> // ==UserScript==
> // @name         Gemini to Obsidian Sync
> // @namespace    http://tampermonkey.net/
> // @version      1.0
> // @description  GeminiのチャットをObsidianに自動保存
> // @author       You
> // @match        https://gemini.google.com/*
> // @grant        GM_xmlhttpRequest
> // ==/UserScript==
> 
> (function() {
>     'use strict';
> 
>     // --- 設定項目 ---
>     const OBSIDIAN_API_KEY = 'あなたのAPIキー'; // Obsidian Local REST APIのキー
>     const OBSIDIAN_PORT = 27123; // HTTPSを使用している場合はポートとプロトコルに注意
>     const VAULT_FOLDER = 'GeminiLogs/'; // 保存先のフォルダ（事前にObsidianで作成推奨）
>     const SYNC_DELAY_MS = 5000; // チャット更新が止まってから保存するまでの待機時間(ms)
>     // ----------------
> 
>     let timeoutId = null;
> 
>     // メイン処理
>     function syncToObsidian() {
>         console.log("Gemini Sync: 同期を開始します...");
> 
>         // 1. チャット内容の取得
>         // ※クラス名はGoogleの更新で変わる可能性があるため、汎用的なセレクタを使用
>         const conversationContainers = document.querySelectorAll('.message-content, .user-query'); // 仮のセレクタ
> 
>         // タイトルの取得（左サイドバーやDOMから取得。なければ日時）
>         let title = document.querySelector('.conversation-title')?.innerText || 'Untitled Chat';
>         // ファイル名に使えない文字を除去
>         const safeTitle = title.replace(/[\\/:*?"<>|]/g, '-').trim() || `Chat-${new Date().toISOString()}`;
>         const filePath = `${VAULT_FOLDER}${safeTitle}.md`;
> 
>         // 2. Markdownの構築
>         let markdownContent = `# ${title}\n\nURL: ${window.location.href}\nLast Updated: ${new Date().toLocaleString()}\n\n---\n\n`;
> 
>         // チャット要素をループしてMarkdown化 (DOM構造に合わせて調整が必要)
>         // ここでは概念的な実装です。実際のDOM構造を見る必要があります。
>         const contentContainer = document.querySelector('main'); 
>         if (!contentContainer) return;
>         
>         // 簡易的なテキスト抽出 (実際にはHTML→Markdown変換ライブラリ推奨、あるいはTurndownServiceなど)
>         // ここではシンプルに各ブロックを処理する想定
>         
>         // ★重要: GeminiのDOMは複雑なので、単純化して「ページ全体のテキスト」として取得するか、
>         // 明確に User / Model を区別するセレクタを見つける必要があります。
>         // 現在のGeminiのDOM構造の例: Userは `user-query`, Modelは `model-response` のような属性を持つことが多いです。
> 
>         const historyElements = contentContainer.querySelectorAll('[role="presentation"]'); // 広い範囲で取得
> 
>         historyElements.forEach(el => {
>             const text = el.innerText;
>             if (!text) return;
>             
>             // ユーザーかモデルかの判定ロジック (クラス名や構造で判定)
>             const isUser = el.innerHTML.includes('user-avatar') || el.closest('.user-query'); 
>             
>             if (isUser) {
>                 markdownContent += `> [!QUESTION] User\n> ${text.replace(/\n/g, "\n> ")}\n\n`;
>             } else {
>                 // モデルの出力
>                 markdownContent += `> [!NOTE] Gemini\n> ${text.replace(/\n/g, "\n> ")}\n\n`;
>             }
>         });
> 
>         // 3. APIへの送信
>         GM_xmlhttpRequest({
>             method: "PUT",
>             url: `https://127.0.0.1:${OBSIDIAN_PORT}/vault/${encodeURIComponent(filePath)}`,
>             headers: {
>                 "Authorization": `Bearer ${OBSIDIAN_API_KEY}`,
>                 "Content-Type": "text/markdown",
>                 "Accept": "*/*"
>             },
>             data: markdownContent,
>             onload: function(response) {
>                 if (response.status >= 200 && response.status < 300) {
>                     console.log("Gemini Sync: 保存成功");
>                 } else {
>                     console.error("Gemini Sync: 保存失敗", response.status, response.responseText);
>                 }
>             },
>             onerror: function(err) {
>                 console.error("Gemini Sync: 通信エラー (自己署名証明書の設定を確認してください)", err);
>             }
>         });
>     }
> 
>     // DOMの変更を監視して、変更が落ち着いたら保存を実行
>     const observer = new MutationObserver((mutations) => {
>         if (timeoutId) clearTimeout(timeoutId);
>         timeoutId = setTimeout(syncToObsidian, SYNC_DELAY_MS);
>     });
> 
>     // 監視開始
>     const targetNode = document.querySelector('body');
>     if (targetNode) {
>         observer.observe(targetNode, { childList: true, subtree: true, characterData: true });
>         console.log("Gemini Sync: 監視を開始しました");
>     }
> })();
> ```
> 
> ### 開発・調整が必要な点
> 
> 実際に動作させるには、いくつかの「壁」を調整する必要があります。
> 
> 1.  **DOMセレクタの特定 (最重要):**
>     
>     -   Gemini の HTML クラス名は難読化されていたり、頻繁に変更されたりします。
>         
>     -   `innerText` で取得するだけではコードブロックや数式が崩れる可能性があります。
>         
>     -   **解決策:** `TurndownService` (HTML to Markdownライブラリ) をCDNから読み込んで、HTMLをそのままMarkdownに変換させるのが最も綺麗に保存できます。
>         
> 2.  **HTTPS と Mixed Content:**
>     
>     -   Gemini (https) から Localhost (http/https) への通信になります。
>         
>     -   Obsidian Local REST API は HTTPS (自己署名証明書) をサポートしていますが、ブラウザが「安全でない証明書」としてブロックすることがあります。
>         
>     -   **解決策:** Tampermonkey の `GM_xmlhttpRequest` はブラウザのクロスドメイン制約をある程度回避できますが、Local REST API 側で HTTPS を有効にし、ブラウザで一度 `https://127.0.0.1:27123/` にアクセスして「危険を受け入れて進む」をしておく必要があります。
>         
> 3.  **マークダウン変換の精度:**
>     
>     -   Gemini は表組みや数式（LaTeX）を使います。単純なテキスト取得ではなく、HTML構造を解析してMarkdownに直すロジック（またはライブラリ）を組み込むと、Obsidian 上での再現性が高まります。
>         
> 
> ### 次のステップ
> 
> もしこのアプローチ（Tampermonkeyスクリプトの開発）で進める場合、\*\*「現在のGeminiのDOM構造に合わせて、HTMLを綺麗なMarkdownに変換する部分」\*\*が開発の肝になります。
> 
> HTMLからMarkdownへ変換するライブラリ（Turndown）を組み込んだ、より実用的なコードの作成をお手伝いしましょうか？（あるいは、特定のチャットURLでDOM構造を確認する方法などをご案内しましょうか？）