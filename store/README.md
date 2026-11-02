# Publishing True Shuffle

Everything needed to put the extension on the browser stores: how to build the package, the images, and the text to paste into each form.

## 1. Build the packages

There are two zips, each holding `manifest.json`, `_locales/`, `icons/`, `options/`, `popup/`, `src/` and `welcome/`, nothing else:

- `true-shuffle-for-youtube-vX.Y.Z.zip` for the Chrome Web Store, Edge Add-ons and Opera. Its manifest leaves out the two Firefox-only keys: Edge's store rejects `background.scripts`, and Chrome before 121 refuses to load it.
- `true-shuffle-for-youtube-firefox-vX.Y.Z.zip` for Firefox Add-ons, with `manifest.json` exactly as it is in the repo.

**Easiest:** download both from the [Releases page](https://github.com/lorenzoGT2007/true-shuffle-for-youtube/releases). The release workflow builds them each time you push a version tag.

**By hand**, from the repo folder (needs Node and Git). It packs the last commit, so commit first:

```sh
node store/pack.js
```

## 2. Images

| File | Size | Used for |
| --- | --- | --- |
| `store-icon.png` | 128×128 | Store icon (Chrome): 96×96 artwork with 16px transparent padding, as Google's guidelines ask |
| `../icons/icon128.png` | 128×128 | Extension logo (Edge, Opera) |
| `screenshot-1.png` | 1280×800 | Screenshot 1: the card and the Up next list |
| `screenshot-2.png` | 1280×800 | Screenshot 2: search and sort on a playlist page |
| `screenshot-3.png` | 1280×800 | Screenshot 3: the notice about videos that vanished |
| `screenshot-4.png` | 1280×800 | Screenshot 4: the toolbar popup, with "Hide watched videos" |
| `screenshot-5.png` | 1280×800 | Screenshot 5: the shuffle going on in YouTube's miniplayer |
| `promo-small.png` | 440×280 | Small promo tile (Chrome, Edge) |
| `promo-marquee.png` | 1400×560 | Marquee promo tile (Chrome, optional: used if the store features the extension) |

All five screenshots and the marquee show the real extension on youtube.com, with NASA's public Artemis playlists; the two alerts in screenshot 3 are sample data. For the Chrome Web Store, [`listing.html`](listing.html) (open it in your browser) has every field to paste, with copy buttons, and these images in order.

## 3. Chrome Web Store

Brave, Vivaldi, Arc and other Chromium browsers install from the Chrome Web Store, so this one listing covers them.

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) and sign in with the Google account you want to publish under. Pay the one-time **$5** registration fee and verify your contact email. 2-Step Verification has to be on for that account.
2. Click **New item** and upload the zip.
3. **Store listing** tab: paste the description below, pick the category **Entertainment** and the language **English** (the package also has Italian, Portuguese (Brazil) and Spanish: the name and summary come translated from it; switch the form's language menu to each of them and paste its translated description below, or the review flags "Mismatching metadata"), then upload `store-icon.png`, the screenshots and the small promo tile. Under **Additional fields**, leave Official URL on None, set Homepage URL to `https://github.com/lorenzoGT2007/true-shuffle-for-youtube` and Support URL to `https://github.com/lorenzoGT2007/true-shuffle-for-youtube/issues`, and leave Mature content off.
4. **Privacy** tab: fill it in from [Privacy answers](#privacy-answers) below.
5. **Distribution** tab: **Public**, all regions.
6. Click **Submit for review**. Review usually takes a few days. You get an email when it's published.
7. Once it's live, add the store link to the main README's Install section.

## 4. Microsoft Edge Add-ons

Free, and it takes the same zip as the Chrome Web Store (not the `-firefox` one).

1. Register (free) in [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview) for the Microsoft Edge program.
2. **Create new extension** and upload the zip.
3. **Availability**: Public, all markets.
4. **Properties**: category **Entertainment**, privacy policy URL below, website `https://github.com/lorenzoGT2007/true-shuffle-for-youtube`.
5. **Store listings**: Partner Center shows one row per language in the package (English, Spanish, Italian, Portuguese (Brazil)) and needs a description (at least 250 characters) and a logo for each row it keeps. Fill in English: the description below, the logo (the 128×128 icon, "Duplicate this logo for all languages"), the screenshots and the small promo tile. Then fill in the other three rows with their translated descriptions below (same logo and screenshots).
6. **Submit**. Edge reviews take up to about a week.

## 5. Opera add-ons

1. Sign in at [addons.opera.com/developer](https://addons.opera.com/developer/) (free).
2. **Upload new extension**, choose the zip, then fill in the listing with the same text and images.

Opera users can also install straight from the Chrome Web Store, so this one is optional.

## 6. Firefox Add-ons

Free. Upload `true-shuffle-for-youtube-firefox-vX.Y.Z.zip`.

Before the first upload, decide on two things in `manifest.json`, because AMO keeps them:

- **Add-on ID** `true-shuffle-for-youtube@lorenzogt2007` (`browser_specific_settings.gecko.id`). It can never change after the first upload, so edit it now if you want another one: letters, digits, `-`, `.` and `_` around a single `@` (or a `{GUID}`), up to 80 characters.
- **Data collection** `"required": ["none"]`. Firefox shows this at install. The extension sends nothing to you or anyone else; its only requests go to youtube.com, the same ones YouTube's page makes, with the sign-in header YouTube's page uses. If a reviewer counts that as collecting, switch to `["authenticationInfo"]`.

1. Sign in at the [Add-on Developer Hub](https://addons.mozilla.org/developers/) and accept the distribution agreement.
2. **Submit a New Add-on**, choose **On this site**, and upload the Firefox zip. Tick **Firefox** only: the scripts run on www.youtube.com, and Firefox for Android uses m.youtube.com.
3. Asked whether a code generator, minifier or other tool made the files: **No**. They are hand-written, so no source code upload is needed.
4. Expect two harmless validation warnings: Firefox ignores `background.service_worker` (it runs `background.scripts`), and the minimum version doesn't cover Firefox for Android.
5. Listing: the same text and images as above, the privacy policy URL below, homepage and support URLs as for Chrome.
6. **Notes to Reviewer** (paste):

   ```
   True Shuffle only runs on www.youtube.com. To read a whole playlist it calls youtube.com's own endpoint /youtubei/v1/browse from the page (src/page.js), the same request YouTube's page makes. When the user is signed in, those requests carry the SAPISIDHASH authorization header YouTube's web client computes from the user's YouTube cookie (needed for private playlists, Watch later and Liked videos); it is built in the tab and sent only to youtube.com. Nothing goes to the developer or anyone else. The content scripts also hide videos the user has watched on YouTube's Home, Subscriptions, channel, search and playlist pages (only when switched on), add a search and sort bar to playlist pages (its "Load all" button scrolls the list only when clicked), and keep a list of each opened playlist's videos to tell the user later which ones were removed. unlimitedStorage: the video lists of big playlists are kept to resume a shuffle, and those playlist lists (capped at 20 MB in all). scripting: injects the extension's own files into YouTube tabs already open on install or update. On install the background script opens the extension's welcome page, and once after an update its What's new page. All code is in the package, unminified, with no remote code and no eval.
   ```

## Updating later

1. Make your changes, raise `"version"` in `manifest.json` (for example `1.1.1`) and update the zip name in the main README's Install section.
2. Commit, then tag and push:
   ```sh
   git tag v1.1.1
   git push origin main --tags
   ```
   The release workflow builds `true-shuffle-for-youtube-v1.1.1.zip` and `true-shuffle-for-youtube-firefox-v1.1.1.zip` and attaches them to a new release.
3. In each dashboard open the item, upload the new zip (Chrome: **Package → Upload new package**; Firefox Add-ons takes the `-firefox` one), and submit for review.

---

## Text to paste

### Name

```
True Shuffle for YouTube
```

### Summary (comes from the manifest, 132 characters max)

```
Shuffles a whole YouTube playlist like a deck of cards: every video plays once, in a truly random order, before anything repeats.
```

### Description

No word appears more than five times (store spam rules), web addresses included.

```
True Shuffle plays a whole YouTube playlist like a deck of cards: every video comes up exactly once, in a truly random order, before anything repeats. It also helps you keep track of your library.

WHY IT'S MORE RANDOM
• It reads the entire list, while YouTube's own shuffle only mixes the part of a long playlist it has loaded.
• One deck per round: nothing comes back until everything has had its turn.
• A uniform Fisher-Yates algorithm with the browser's cryptographic random generator.
• Optional: avoids the same channel twice in a row whenever it can.
• When a new round starts, the songs you just heard stay away from its beginning.

HOW IT WORKS
• Start any clip from a list and it turns on by itself. A round button at the bottom right shows your progress; click it for the card with what's next and an "Up next" queue you can search to pick a video.
• The player's Next and Previous buttons, Shift+N / Shift+P and your keyboard's media keys follow the deck.
• Your place is saved across reloads and browser restarts.
• Keeps going in the miniplayer while you browse.
• Private lists, Watch later and Liked videos work while you're signed in.

ORGANIZE YOUR LIBRARY
• Hide what you've already seen on Home, Subscriptions, a channel's Videos tab, search results and lists, with one switch or Alt+Shift+U.
• Search any playlist (Watch later too) by title or channel, sort it by title, duration, channel, date added (when shown) or unwatched first, then play or mix just the items shown. Only the view changes, never the playlist itself. After one "Load all", search keeps covering every item.
• Find out when items vanish: next time you open a playlist (on long ones press "Load all" first), a small notice names the ones that were removed or became private or deleted, with their old titles. History and CSV export in the options.
• Every setting in one place, on the options page.

GOOD TO KNOW
• Available in English, Italian, Portuguese (Brazil) and Spanish.
• Mixes (the endless auto-generated ones) aren't supported: save the songs to one of your own lists instead.

PRIVACY
Nothing is sent to the developer or anyone else: True Shuffle only connects to youtube.com and has no servers, no analytics and no ads.

Free and open source: https://github.com/lorenzoGT2007/true-shuffle-for-youtube
Enjoying it? Buy me a coffee: https://buymeacoffee.com/lorenzogt

True Shuffle is an independent project, not affiliated with or endorsed by YouTube or Google.
```

The same description in the package's other languages (paste each into its language in the dashboard, or the review flags "Mismatching metadata"):

### Description (Italian)

```
True Shuffle mescola un'intera playlist di YouTube come un mazzo di carte: ogni video viene riprodotto esattamente una volta, in ordine davvero casuale, prima che se ne ripeta uno. Ti aiuta anche a tenere d'occhio la tua raccolta.

PERCHÉ È PIÙ CASUALE
• Legge l'intero elenco, mentre la riproduzione casuale di YouTube mescola solo la parte già caricata di una playlist lunga.
• Un mazzo per ogni giro: niente ritorna finché tutto non ha avuto il suo turno.
• Un algoritmo Fisher-Yates uniforme, con il generatore crittografico di numeri casuali del browser.
• Facoltativo: evita lo stesso canale due volte di fila, quando possibile.
• Quando parte un nuovo giro, i brani appena ascoltati restano lontani dall'inizio.

COME FUNZIONA
• Avvia qualsiasi clip da una lista e si attiva in automatico. Un pulsante rotondo in basso a destra mostra i tuoi progressi; fai clic per aprire il riquadro, con quello che viene dopo e un elenco "A seguire" in cui puoi cercare il video da scegliere.
• I pulsanti Successivo e Precedente del player, Shift+N / Shift+P e i tasti multimediali della tastiera seguono l'ordine del mazzo.
• Il punto a cui sei arrivato resta salvato anche ricaricando la pagina o riavviando il browser.
• Continua nel miniplayer mentre navighi.
• Le liste private, Guarda più tardi e Video piaciuti funzionano quando hai eseguito l'accesso.

ORGANIZZA LA TUA RACCOLTA
• Nascondi ciò che hai già guardato nella Home, nelle Iscrizioni, nella scheda Video di un canale, nei risultati di ricerca e nelle liste, con un interruttore o con Alt+Shift+U.
• Cerca in qualsiasi playlist (anche in Guarda più tardi) per titolo o canale, ordinala per titolo, durata, canale, data di aggiunta (se visibile) o prima i non guardati, poi riproduci o mescola solo gli elementi mostrati. Cambia solo ciò che vedi, mai la playlist in sé. Dopo un "Carica tutti", la ricerca continua a coprire ogni elemento.
• Scopri quando spariscono degli elementi: la volta successiva che apri una playlist (in quelle lunghe premi prima "Carica tutti"), un piccolo avviso indica quelli rimossi o diventati privati o eliminati, con i loro vecchi titoli. Cronologia ed esportazione CSV nelle opzioni.
• Tutte le impostazioni in un unico posto, nella pagina delle opzioni.

BUONO A SAPERSI
• Disponibile in inglese, italiano, portoghese (Brasile) e spagnolo.
• I Mix (quelli infiniti generati in automatico) non sono supportati: salva invece i brani in una delle tue liste.

PRIVACY
Niente viene inviato allo sviluppatore né ad altri: True Shuffle si collega solo a youtube.com e non ha server, né statistiche d'uso, né pubblicità.

Gratuito e open source: https://github.com/lorenzoGT2007/true-shuffle-for-youtube
Ti piace? Offrimi un caffè: https://buymeacoffee.com/lorenzogt

True Shuffle è un progetto indipendente, non affiliato a YouTube o Google né approvato da loro.
```

### Description (Spanish)

```
True Shuffle reproduce toda una playlist de YouTube como una baraja de cartas: cada video sale exactamente una vez, en un orden realmente aleatorio, antes de que se repita ninguno. También te ayuda a llevar el control de tu biblioteca.

POR QUÉ ES MÁS ALEATORIO
• Lee la lista completa, mientras que el modo aleatorio de YouTube solo mezcla la parte de una playlist larga que ya tiene cargada.
• Una baraja por ronda: nada vuelve a salir hasta que todo haya tenido su turno.
• Un algoritmo Fisher-Yates uniforme, con el generador criptográfico de números aleatorios del navegador.
• Opcional: evita el mismo canal dos veces seguidas siempre que puede.
• Cuando empieza una nueva ronda, las canciones que acabas de escuchar quedan lejos del principio.

CÓMO FUNCIONA
• Pon cualquier clip de una lista y la mezcla se activa sola. Un botón redondo abajo a la derecha muestra tu progreso; haz clic en él para abrir la tarjeta con lo que viene después y una cola "A continuación" en la que puedes buscar para elegir un video.
• Los botones Siguiente y Anterior del reproductor, Shift+N / Shift+P y las teclas multimedia de tu teclado siguen el orden de la baraja.
• Se guarda por dónde ibas, aunque recargues la página o reinicies el navegador.
• Sigue funcionando en el minirreproductor mientras navegas.
• Las listas privadas, Ver más tarde y Videos que me gustan funcionan con la sesión iniciada.

ORGANIZA TU BIBLIOTECA
• Oculta lo que ya has visto en Inicio, Suscripciones, la pestaña Videos de un canal, los resultados de búsqueda y las listas, con un interruptor o Alt+Shift+U.
• Busca en cualquier playlist (también en Ver más tarde) por título o canal, ordénala por título, duración, canal, fecha de adición (cuando se muestra) o sin ver primero, y luego reproduce o mezcla solo los elementos mostrados. Lo que cambia es la vista, nunca la playlist en sí. Tras usar "Cargar todo" una vez, la búsqueda sigue abarcando cada elemento.
• Entérate cuando desaparezcan elementos: la próxima vez que abras una playlist (en las largas, haz clic primero en "Cargar todo"), un pequeño aviso nombra los que se quitaron, se hicieron privados o se eliminaron, con sus títulos de antes. Historial y exportación CSV en las opciones.
• Toda la configuración en un único lugar: la página de opciones.

CONVIENE SABER
• Disponible en inglés, italiano, portugués (Brasil) y español.
• Los Mix (los infinitos, generados automáticamente) no son compatibles: en su lugar, guarda las canciones en una de tus propias listas.

PRIVACIDAD
No se envía nada al desarrollador ni a nadie más: True Shuffle solo se conecta a youtube.com y no tiene servidores, ni analíticas, ni anuncios.

Gratis y de código abierto: https://github.com/lorenzoGT2007/true-shuffle-for-youtube
¿Te gusta? Invítame a un café: https://buymeacoffee.com/lorenzogt

True Shuffle es un proyecto independiente: no está afiliado a YouTube ni a Google, ni cuenta con su respaldo.
```

### Description (Portuguese, Brazil)

```
O True Shuffle embaralha uma playlist inteira do YouTube como um baralho de cartas: cada vídeo toca exatamente uma vez, em ordem realmente aleatória, antes de qualquer repetição. Também ajuda a manter o controle da sua biblioteca.

POR QUE É MAIS ALEATÓRIO
• Lê a lista inteira, enquanto a ordem aleatória do próprio YouTube apenas mistura a parte de uma playlist longa que já foi carregada.
• Um baralho por rodada: nada volta até que tudo tenha tocado.
• Um algoritmo Fisher-Yates uniforme com o gerador criptográfico de números aleatórios do navegador.
• Opcional: evita o mesmo canal duas vezes seguidas sempre que possível.
• Quando uma nova rodada começa, as músicas que você acabou de ouvir ficam longe do início dela.

COMO FUNCIONA
• Inicie qualquer vídeo de uma lista e a extensão liga sozinha. Um botão redondo no canto inferior direito mostra o seu progresso; clique nele para abrir o painel com o que vem depois e uma fila "A seguir" em que dá para buscar e escolher um vídeo.
• Os botões Próximo e Anterior do player, Shift+N / Shift+P e as teclas de mídia do seu teclado seguem o baralho.
• Sua posição fica salva mesmo ao recarregar a página ou reiniciar o navegador.
• Continua tocando no miniplayer enquanto você navega.
• Listas privadas, Assistir mais tarde e Vídeos curtidos funcionam quando você está conectado à sua conta.

ORGANIZE SUA BIBLIOTECA
• Oculte o que você já viu no Início, em Inscrições, na guia Vídeos de um canal, nos resultados de pesquisa e nas listas, com um único botão ou Alt+Shift+U.
• Pesquise qualquer playlist (Assistir mais tarde também) por título ou canal, ordene por título, duração, canal, data de adição (se aparecer) ou não assistidos primeiro, e depois reproduza ou embaralhe só os itens mostrados. Só o que você vê muda, nunca a própria playlist. Depois de um "Carregar todos", a busca continua incluindo todos os itens.
• Saiba quando itens somem: ao reabrir uma playlist (nas longas, clique antes em "Carregar todos"), um pequeno aviso mostra quais foram removidos, ficaram privados ou foram excluídos, com os títulos antigos. Histórico e exportação em CSV nas opções.
• Todas as configurações em um só lugar, na página de opções.

BOM SABER
• Disponível em inglês, italiano, português (Brasil) e espanhol.
• Mixes (aqueles sem fim, gerados automaticamente) não são compatíveis: em vez disso, salve as músicas em uma das suas próprias listas.

PRIVACIDADE
Nada é enviado ao desenvolvedor nem a ninguém: o True Shuffle se conecta apenas ao youtube.com e não tem servidores, nem ferramentas de análise, nem anúncios.

Gratuito e de código aberto: https://github.com/lorenzoGT2007/true-shuffle-for-youtube
Está gostando? Me pague um café: https://buymeacoffee.com/lorenzogt

O True Shuffle é um projeto independente, não afiliado ao YouTube ou ao Google, nem endossado por eles.
```

### What's new in 1.1.0 (Firefox Add-ons "Release notes"; anywhere a store asks)

```
New: hide videos you've watched, search and sort any playlist then play or shuffle just what's shown, and alerts when videos vanish from your playlists.
Also: the shuffle keeps going in YouTube's miniplayer, every setting is on one options page, and it speaks Italian, Portuguese (Brazil) and Spanish.
```

### Privacy answers

**Single purpose**

```
Organize and play your YouTube playlists and Watch later: shuffle a playlist so every video plays once before any repeats, search and sort it, get told when videos disappear from it, and hide videos you've already watched from YouTube's lists (Home, Subscriptions, channels, search, playlists).
```

**Permission justifications**

| Permission | Justification |
| --- | --- |
| `storage` | `Saves the user's settings; for each shuffled playlist, the shuffled order, the user's place in it and the playlist's video list, so the shuffle survives reloads and browser restarts; and for playlists the user opens, a list of their videos, to tell the user later which ones disappeared (with a history of those alerts) and to let the search find videos not loaded on the page.` |
| `unlimitedStorage` | `Playlists can hold thousands of videos: the shuffles of up to 40 playlists and the video lists of opened playlists (capped at 20 MB in all) can exceed the default 10 MB extension storage limit.` |
| `scripting` | `Only right after the extension is installed or updated: injects the extension's own packaged scripts into YouTube tabs that were already open, so the user doesn't have to reload them. No other use.` |
| Host permission `https://www.youtube.com/*` | `The extension works only on YouTube. It reads the playlist being played (using the same requests YouTube's own page makes), follows which video is playing and starts the next video of the shuffle. When the user switches it on, it hides already-watched videos in YouTube's video lists. On playlist pages it adds a search and sort bar (its "Load all" button scrolls the list only when clicked) and compares the videos with the last visit to tell the user which ones disappeared. After an install or update it finds the YouTube tabs already open to add its scripts.` |

**Remote code**: No, I am not using remote code.

```
All JavaScript is packaged in the extension. It loads no remote scripts and uses no eval.
```

**Data usage**: tick these three boxes (the store counts data handled only on the user's device too):

- **Authentication information**: requests that read private playlists carry the sign-in header YouTube's page creates from the user's YouTube cookie. It is sent only to youtube.com and never stored.
- **Website content**: playlist titles, video titles and channel names, stored on the user's device to run the shuffle, to tell the user when videos disappear from a playlist they open, and to search it.
- **Web history**: which playlists the user shuffled or opened, their titles and when, and which of their videos played, kept only on the user's device to resume the shuffle and to compare a playlist with the last visit.

Then tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL** (the GitHub Pages copy of `PRIVACY.md`, from `docs/privacy.html`; turn Pages on first: repo **Settings → Pages → Deploy from a branch → main, /docs**)

```
https://lorenzogt2007.github.io/true-shuffle-for-youtube/privacy.html
```
