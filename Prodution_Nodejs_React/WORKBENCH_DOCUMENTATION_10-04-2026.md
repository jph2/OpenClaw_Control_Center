# OpenClaw Workbench IDE: Architecture & Hardening Documentation
**Date:** 10.04.2026, 12:30 Uhr  
**Component:** OpenClaw-OpenUSDGoodtstart-Extension / Production_Nodejs_React  

Dieses Dokument protokolliert alle tiefgreifenden architektonischen Anpassungen, die während der massiven System-Hardening und UX-Refinement-Phase der Workbench IDE implementiert wurden.

---

## 1. Implementierte System-Upgrades & Features

### 1.7 Known Bugs (Deferred)
- **Address Bar & Up-Button Navigation**: Es gibt einen persistenten Bug in der Pfadanzeige. Das Eingabefeld (`<input>`) ist teilweise unsichtbar oder der Pfad löst unerwartete `403 Forbidden` Server-Fehler beim Navigieren hinaus bis zum Workspace-Speicherlimit (z.B. `/`) aus. Das Layout dehnt sich teils nicht korrekt (`minWidth` Collapse) wodurch Icons verrutschen. Reparatur vorübergehend zurückgestellt, um Channel Manager & Telegram Backend fortzusetzen.

### 1.1 Backend: Filesystem Hardening & Absolute Access
- **Global Volume Access (`WORKSPACE_ROOT=//`)**: Um den Zugriff über den eigenen Docker/Repro-Root hinaus auf sämtliche Host-Volumes (wie `/media/claw-agentbox/data` oder `/home/...`) zu garantieren, läuft der Server fortan auf Root-Level `/`.
- **EACCES Permission Catching**: Ein fataler 500/502 Error beim Aufruf des `GET /api/workbench/tree` Endpoints wurde behoben. Ursache war, dass rekursive `fs.readdir()`-Aufrufe unweigerlich in Root-Level Systemordner rannten (z. B. `/etc/credstore` oder `/lost+found`), die dem Linux-User EACCES-Sperren auferlegten. Unhandled Rejections rissen zuvor das gesamte Backend mit in den Tod. **Lösung:** Strikte Isolierung _jedes_ Datei-Reads in `try/catch`-Blöcken. Unlesbare Dateien/Verzeichnisse werden leise übergangen statt den Baum-Scan zu beenden.

### 1.2 Backend: Tree Recursion & Depth Optimization
- **Depth Limit Erhöhung**: Um tief verschachtelte Files (wie z.B. Markdown-Dokumentationen tief im `skills/`-Netzwerk) aufzudecken, wurde die Rekursionstiefe (`maxDepth`) des Backends von extrem restriktiven 4 Leveln auf **8 Level** gesetzt. 
- **Performance Ignore-List**: Um bei `maxDepth=8` nicht in Blackholes zu scannen und den NodeJS-Server abstürzen zu lassen, werden nun `node_modules`, `.git`, `dist` und `build` explizit in der Tree-Generierung auf unterster C-Ebene ignoriert.
- **Absolute Path Propagation**: Da `WORKSPACE_ROOT` nun bei `/` anfängt, haben relative Pfade im Frontend den Raw-Editor zerlegt (Dateien öffneten sich nicht). Das Backend serviert nun explizit den **absoluten Path** unter der `path`-Eigenschaft jeden Node-Items.

### 1.3 Frontend: Storage & State Persistence
- **Storage Persistenz (Zustand)**: Die App nutzt nun die `persist`-Middleware von `zustand/middleware` für den gesamten Store. **Sämtliche Layout-Entscheidungen, Scroll-Toggles und Custom Workspaces** werden nun fortlaufend über den Browser-Session-Reload hinaus im `localStorage` unter `workbench-storage` gesichert.

### 1.4 Frontend: UX, Layout & Workflow Intelligence
- **Intelligente Ordner-Kontext-Abfrage (`selectedNode`)**: Die vier Kernfunktionen (Create Folder, Create File, Upload, Duplicate) berechnen ihr Ziel jetzt interaktiv anhand des im File-Baum aktiv selektierten Ordners/Elements. 
- **Breadcrumb Location & Copying**:  Der File-Directory Header enthält eine Click-2-Copy absolute Pfad-Anzeige. Die Ordner-Iconographie (📁) ist `userSelect: 'none'` via CSS gestylt, um das versehentliche Mit-Kopieren von Emojis zu verhindern.
- **String Sanitization Input-Trim**: Das "Custom Workspace" Feld besitzt strikte `.trim()` Middleware on-Submit, um Leading/Trailing Spaces (die sonst zu `ENOENT - '/ /home/...'` Crashlogs auf OSI-Layer führen) rigoros zu annulieren.
- **Raw Editor Horizontal Scrolling**: Die `<textarea>` des Raw Editors nutzt striktes `overflowX: 'auto'` und `whiteSpace: 'pre'` Patterning, um breite Arrays, Code-Blöcke oder unformatierte Textstrukturen barrierefrei horizontal ohne automatische Wort-Umbrüche zu scrollen.

### 1.5 Frontend: Latest Docs & Folders (Split Columns)
- **Local History Expansion**: Die Workbench "Latest Docs Across Roots" Sektion wurde refactored. Es existieren nun zwei saubere Columns (`display: flex` + `flex: 1`): "Latest Docs" (für ausgewählte Files) und "Latest Folders" (für aufgerufene Directories). Dies beschleunigt die Kontext-Navigation bei großen Root-Wechseln drastisch.
- **Zustand Directory Persistence**: Ein neues Array `recentDirs` und der Action Dispatch `addRecentDir` speichern Ordner-Historien nun synchron im `localStorage` parallel zu den Dateihistorien.

### 1.6 Frontend: Navigatable Address Bar
- **Editable File Directory Path**: Der zuvor read-only "Click to copy" Pfad in der File Directory Header-Leiste wurde durch eine interaktive, breite Input-Box (`input`) ersetzt.
- **Root Quick-Jumping**: User können nun über die Input-Box direkt absolute Pfade tippen und per `Enter` (oder Button-Klick auf "Go") sofort das Root-Directory der Workbench dorthin verschieben (`setCurrentRoot()`). Der State `addressBarValue` fängt dabei den lokalen Component-Zustand live ein, ohne direkt beim Tippen (onChange) den kompletten Verzeichnisbaum teuer und hakelig neu rendern zu müssen.

---

## 2. Best Practices

✅ **Zustand für File-States & App-Context nutzen**
Jeglicher globale App-Status sollte an den Zustand Store (`useWorkbenchStore`) gelagert werden. Mit der neuen `persist`-Middleware überlebt dieser Reloads. Das React-Query Array (`['workbench-tree']`) kümmert sich rein um Server-Daten-Fetches.

✅ **Flexible Pane Header mit Flexbox Shrinking**
Die Tree-Details (Dateigröße, Datum) verschwinden responsiv sauber, wenn sich User Panels zu Seite ziehen, weil `flex: 1 1 auto` mit `minWidth` bei Parent-Elementen unter `overflow: hidden` verwendet wird. Keine harten Breiten setzen!

✅ **Strict Error Containment bei Filesystem Scans**
Arbeiten mit dem Dateisystem oberhalb der Sandbox erfordert paranoide Vorsicht. `fs.readdir` MUSS in der Workbench immer isoliert werden, da auf Host-Systemen Systemd-Services, Tmpfs-Mounts oder Read-Only-Datensysteme jederzeit spontan Permissions blockieren.

---

## 3. Anti-Patterns & What to Avoid

🛑 **ANTI-PATTERN 1: Rekursive Dateisuche (maxDepth) ohne Limit öffnen**
*Was zu vermeiden ist:* Wenn Parameter wie `maxDepth` auf unendlich (oder astronomisch hohe Zahlen wie 30+) gesetzt werden.
*Warum:* Ein User, der `/` in das Custom Workspace Feld eingibt, löst eine exponentielle Kettenreaktion aus (100.000+ Ordner in Linux Root). Das blockiert den NodeJS I/O Thread, verursacht massive CPU Spikes und führt zum Crash (Memory Overflow). Wir haben das Limit bewusst auf `8` gesetzt in Kombination mit den "Custom Workspaces" als Einstiegspunkt.

🛑 **ANTI-PATTERN 2: Übernahme unvalidierter Frontend-Pfade (`path.resolve()`)**
*Was zu vermeiden ist:* Direkte Nutzung relativer Pfade aus dem URL-Parametern zur Evaluierung von OS-Dateien (z. B. Unsanitized `fs.readFile('/' + req.query.path)`).
*Warum:* Führt zum `Directory Traversal Attack (Path Traversal)`. Ein Pfad wie `../../../../etc/shadow` bricht aus dem Verzeichnis aus.
*Behebung:* Wir nutzen `resolveSafe()`, welche mittels `startsWith(rootWithTrailingSlash)` sicherstellt, dass das Ergebnis sich immer in einem legitimen Baum befindet. Dies darf unter keinen Umständen jemals umgeschrieben oder "vereinfacht" werden.

🛑 **ANTI-PATTERN 3: String-Concatenation statt `path.join` für Filesysteme**
*Was zu vermeiden ist:* `const fullPath = basePath + '/' + fileName;`
*Warum:* Führt auf verschiedenen Laufwerken/Betriebssystemen (oder wenn `basePath` schon mit `/` aufhört) zu ungültigen Pfaden (z.B. `//media/`).
*Best Practice:* Nutze in Node *immer* `path.join(basePath, fileName)` oder `path.resolve`.

🛑 **ANTI-PATTERN 4: Native `<textarea>` für riesige Raw-Logs ohne Wrap-Handling**
*Was zu vermeiden ist:* CSS mit automatischer Wortbreite oder Hidden Overflows im Code-Editor. 
*Warum:* Riesige SVG/JSON Objekte auf nur 4 Linien crashen Browser Tabs, wenn der Browser Tausende Wörter in Echtzeit umbrechen muss. 
*Behebung:* `<textarea>` hat in der Workbench IMMER `wrap="off"`, `whiteSpace: 'pre'` und `overflowX: 'auto'` zu tragen. Dies überträgt das Scrolling vom DOM in die GPU statt die CPU permanent Paint-Recalculations berechnen zu lassen.

🛑 **ANTI-PATTERN 5: Zustand State Mutationen statt Immutability**
*Was zu vermeiden ist:* `workspaces.push(ws)` innerhalb der Store Methoden nutzen.
*Warum:* Zustand benötigt Immutable Updates. Sonst erkennen die React-Hooks (wie `useWorkbenchStore`) nicht, dass Render-Updates verschickt werden müssen, was zu UI Ghosting führt. (Beispielfix aus dem Code: `[...new Set([...state.workspaces, ws])]`).

🛑 **ANTI-PATTERN 6: LocalStorage Persistenz von rohen Datei-Inhalten (Verschleppter Speicher-Tod)**
*Was zu vermeiden ist:* Das Serialisieren der Eigenschaft `localContent` im Zustand persist-Middleware-Store.
*Warum:* Die `localStorage` Web-API hat ein striktes browser-übergreifendes Quota-Limit von 5MB pro Domain. Wenn Backend-Logfiles, HD-SVG-Strings oder riesige JSON-Dateien im Raw Editor geöffnet werden, brennt das automatische Mit-Persistieren der Strings sofort den Speicher durch. Das Ergebnis ist ein unweigerlicher `QuotaExceededError`, woraufhin die UI komplett irreversibel einfriert oder Cache-Korruptionsfehler beim F5-Reload generiert.
*Behebung:* Über die Eigenschaft `partialize` als Whitelist/Blacklist in den Middleware-Optionen muss explizit gefiltert werden: `partialize: (state) => Object.fromEntries(Object.entries(state).filter(([key]) => !['localContent'].includes(key)))`.

🛑 **ANTI-PATTERN 7: Sequentielles Block-I/O in Server-Tiefen-Scans**
*Was zu vermeiden ist:* Ein iterativer `for...of` Loop gepaart mit `await fs.stat()` beim rekursiven Indexieren von Nodes. 
*Warum:* Wenn `maxDepth=8` gewährt wird und der Tree 5.000 verschachtelte Dateien liest, zwingt der asynchrone aber blockierende Warte-Zyklus den Node.js Event-Loop auf einen seriellen Festplatten-Lesekopf. Jede Datei muss sequentiell warten, bis die Stats der Vorgänger-Datei berechnet sind. 
*Behebung:* Parallelisierung durch `Promise.all(entries.map(async (entry) => ...))`. Sämtliche Dateizugriffe auf einer Subtraversierungs-Stufe werden gleichzeitig verarbeitet, was die Ausführungszeit von exponentiell auf konstant minimiert.

🛑 **ANTI-PATTERN 8: Blindes Vertrauen in Unix-Verzeichnis-Typisierung (Das Symlink Schwarze Loch)**
*Was zu vermeiden ist:* In Filtern ausschließlich nach `entry.isDirectory()` zu filtern, ohne Symbolic Links zu beachten.
*Warum:* Linux/Ubuntu Host-Systeme haben oft Symlinks (`ln -s`), die tiefer in Ordnern liegen und schlichtweg an The Root Directory `/` "zurückweisen". Wenn das Backend dies iteriert, taucht es in eine Endlos-Iteration (selbstauslösende Feedback-Loop) eines Verzeichnis-Spiegels bis das Hardlimit oder der Call Stack Overflow zuschlägt.
*Behebung:* Immer an System-Sensibler Stelle abfragen und blocken: `.filter(e => !e.isSymbolicLink())`. Symlinks in Server-APIs niemals blind auflösen.
