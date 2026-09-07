# Frosthem — Barbaren

En spelbar ARPG-prototyp i Diablo 2:s anda, i ett vinterlandskap. Du skapar en
karaktär, börjar i byn Frosthem med en rostig yxa och ingenting annat, följer
stigen norrut, slåss, plockar loot, levlar och bygger en karaktär. Spelet sparas
automatiskt i webbläsaren.

## Spela

**▶ Spela här: https://virrepinnen.github.io/frosthem/**

Inget att installera — det körs direkt i webbläsaren. Karaktären sparas lokalt
i din webbläsare, så du kan stänga fliken och fortsätta senare på samma dator.

## Köra lokalt

Ingen byggkedja krävs — projektet är statiska filer. Starta en webbserver i
projektroten:

```bash
python3 -m http.server 8123
```

Öppna sedan `http://127.0.0.1:8123/index.html`. Filerna är ES-moduler, så de
måste serveras över HTTP — att öppna `index.html` direkt från disk fungerar inte.

> **Om din karaktär "försvinner":** sparningen ligger i webbläsarens
> `localStorage`, som är knuten till exakt ursprung. `http://127.0.0.1:8123` och
> `http://localhost:8123` räknas som *två olika sajter* — och den publicerade
> sidan är en tredje. Håll dig till samma adress, så ligger karaktären kvar.

## Styrning

| Tangent | Effekt |
| --- | --- |
| `←` `↑` `↓` `→` | Gå |
| — | Attacken sköter sig själv när en fiende är inom räckhåll |
| `1`–`6` | Skills |
| `Q` | Hälsodryck |
| `E` | Använd: tala, vägsten, portal, kista |
| `Mellanslag` | Undanrullning (osårbar mitt i rullningen) |
| `T` | Öppna stadsportal (och tillbaka igen) |
| `I` / `C` / `K` | Väska · Karaktär · Skills |
| `F5` | Spara nu |
| `F1` / `F2` | Hur man spelar · dölj snabblistan |
| `Esc` | Stäng paneler, annars paus- och sparmeny |

Styrningen är byggd för bärbar dator och **kräver ingen mus alls**: högerhanden
på piltangenterna, vänsterhanden på `1`–`6` och `Q`. WASD är medvetet borttaget
så att vänsterhanden tillhör skillsen. Du siktar automatiskt på
närmaste fiende med fri sikt, och slår av dig själv så fort någon kommer inom
räckhåll — en markör visar vem som står i tur. Både auto-sikte och auto-attack
kan stängas av i pausmenyn, och vänsterklick fungerar fortfarande som manuell
utlösare.

Ikonerna under minimapen öppnar samma vyer med musen; håll pekaren över dem för
att se genvägen. En gyllene prick betyder att du har oanvända poäng.

Skills läggs i snabbfältet automatiskt när du lär dig dem. Högerklick på en
skill i skill-panelen flyttar den till nästa fack.

Föremål kan också plockas upp genom att klicka på deras namnetikett på marken.
Guld och drycker plockas upp automatiskt när du går över dem.

## Vad som är byggt

**Världen.** Byn Frosthem (fast layout, handlare + NPC) och tre vildmarkszoner:
Bleka hedarna → Vargpasset → Den frusna graven. Vildmarkszonerna genereras
procedurellt varje gång du går in i dem, med handdesignade regler.

Varje karta har en **stig** som binder ihop ingången med utgången, och en
**avstickare** som leder till zonens egen plats — Stenbrottet, Det övergivna
lägret eller Offerplatsen. Där står en kista, en helgedom och ett elitpack.
Stigen är zonens ryggrad: den ger riktning utan att kartan blir en korridor,
och monstergrupperna sitter *längs* den så att man möter dem på färden.

**Gränserna går inte att trycka på.** Stigen fortsätter ut ur bilden i norr,
och där den lämnar kartan står två resta stenar med marken bakom sig upplöst i
yrsnö. Går du dit *av egen kraft* tonar skärmen ner en tredjedels sekund och du
kliver in i nästa område — ingen portal, ingen `E`, ingen ruta. Samma sak
söderut, och samma sak när du går ut genom byporten i Frosthem. Kravet på egen
rörelse är medvetet: en knuff i ryggen mitt i en strid ska inte kunna slänga ut
dig ur kartan, och man landar alltid en bit innanför tröskeln så att första
steget inte skickar tillbaka en.

Platsens namn tonar in högt upp på skärmen när du kommer fram, och står sedan
kvar under minimapen så länge du är där.

**Resor.** Varje zon har en **vägsten** som du låser upp genom att röra vid den;
därefter kan du hoppa mellan alla upptäckta vägstenar. **Stadsportalen** (`T`)
tar dig till Frosthem och tillbaka till exakt samma plats — den bevarar zonen du
lämnade, inklusive monster och loot på marken, vilket är hela poängen när zoner
annars genereras om vid varje besök.

Portalen är inte gratis: den laddar i **2,5 sekunder**, varav den sista
halvsekunden är porten som öppnar sig och gestalten som kliver in. Rör du dig
bryts den, och **en enda träff bryter den**. Flykt är alltså något man måste
skaffa sig utrymme för, inte en knapp man trycker när det redan brinner.

**Två resurser, inte en.** Uthållighet och mana är skilda åt, och syns var för
sig: liv som klot till vänster, mana som klot till höger, och uthållighet som en
egen gyllene stapel mitt i blickfånget.

*Uthållighet* är kroppen. Varje svep och varje fysisk skill kostar, och **under
strid återhämtar du dig bara till 40 %** av normal takt — bryt kontakten så
fyller den på snabbt. Varje fälld fiende ger 8 tillbaka. Det gör stridsekonomin
till en avvägning: du kan rensa en flock om du träffar effektivt, men bomsvep
och tåligare fiender tvingar dig att backa och andas. Vitalitet bär den, och
tunga vapen kostar mer per svep.

*Mana* är viljan, och dras bara av Frost-skills. Den bryr sig inte om huruvida
du slåss. Bygger du på stål och stryk räcker det med lite vilja — vilket är
hela poängen med att dela upp dem.

**Fog of war.** Vildmarken börjar svart på kartan och avtäcks medan du går.
Minimapen minns terräng, stigar och det du hittat — men visar bara fiender som
är nära dig just nu. Byn är känd från början.

**Perspektiv.** Kameravinkeln är låst och ortografisk, som i Diablo 2: inget
krymper med avståndet. Markplanet är hoptryckt i höjdled (0,58) så att det lutar
bort från betraktaren, medan allt som har höjd — figurer, träd, hus, stenblock —
reser sig ur den hoptryckta marken i *oförminskade* pixlar. Det är den
skillnaden som gör att en gestalt ser ut att stå upp i stället för att ligga
platt.

Simuleringen är fortfarande ren 2D: kollisioner, avstånd och AI räknar i
världsplanet. Bara ritningen och mus-till-värld-omräkningen känner till
projektionen, vilket gör att spelreglerna inte behövde röras alls.

**Figuren.** Barbaren är en gammal, enögd vandrare — pälskrage över axlarna,
lång rock till marken, vandringsstav i den fria handen och en korp på axeln som
vaggar i sin egen takt. Hon är ritad i banor, inte i bild, och står alltid
lodrätt som ett D2-sprite: riktningen byter *bild*, inte rotation. Framifrån ser
du ansiktet med ögonlappen och det långa skägget; bakifrån bara hårmassan som
faller ner över kragen.

**Manteln har fysik.** Fållens utslag är en dämpad fjäder som strävar mot
*motsatt* håll än rörelsen, så tyget alltid släpar efter kroppen. Stannar du
faller det tillbaka, pendlar en gång förbi vilan och lägger sig — underdämpat med
flit, för ett kritiskt dämpat tyg ser stelt ut. Fjädern lever i speltillståndet
och integreras med samma dt som allt annat, och hastigheten mäts ur den faktiska
förflyttningen så den gäller lika bra för gång som för rusning och rullning.
Utslaget är taklistat: en rullning går i nästan 1 000 px/s och skulle annars
slänga fållen långt utanför figuren.

Fyra hugg växlar så att två slag i rad aldrig ser lika ut: **svep**, **backhand**,
ett tyngre **överhugg** och en **stöt** med utfall. Grundattacken alternerar de
två första och slår in ett tungt hugg var fjärde slag; skills har sina egna.
Släpljuset ritas ur samma kurva som klingan — bandet följer alltså exakt den väg
vapnet tog, med mörk kärna och ljus framkant eftersom ett rent vitt svep
försvinner mot snön.

Monstren står upp på samma villkor: vargar på fyra ben från sidan, plundrare med
båge, vålnader som svävar utan skugga, och bossen med sin iskrona.

`sprite-lab.html` ritar figuren i alla åtta riktningar, mantelutslaget steg för
steg och varje hugg bildruta för bildruta.

**Strid.** Svep med båge och räckvidd, omedelbar träffdetektion (responsivitet
före windup), knockback, kritiska träffar, blödning, frysning, bedövning och
livsdräneri. Flockarna är många och små — en hop snövargar är ett dussin
individer, inte fyra klumpar. Fienderna har fem arketyper med olika AI: laddare, närstrid,
distans och tunga varelser. De är avsiktligt aggressiva — det driver tempot.

**Bossen.** Jarl Hravn **sover när du kommer in i arenan** — han står bland
sina vakter utan livstapel, vänder bara huvudet mot dig och slår inte tillbaka.
Du får leta reda på honom och börja slaget själv. Första träffen väcker honom och
allt inom 460 pixlar på en gång, med skärmblixt, skak och en nova ut från kroppen.
Autoattacken ignorerar sovande mål, så du kan gå fram och titta utan att råka
starta striden. Därefter kör han en egen AI med fyra **telegraferade** attacker:
*Frostsvep* (båge framåt), *Iskross* (markerad cirkel där du står — gå därifrån),
*Rimlans* (markerad linje, sedan en rusning) och *Kallar vålnader* vid 66 % och
33 % liv. Varje attack ritar sin träffyta på marken medan den laddar.

**Elit-packs.** Champions och elitmonster med slumpade modifierare — *Snabb,
Kraftfull, Frostbunden, Pansrad, Blodtörstig, Skyddad* — som kombineras fritt.
Det ger oförutsägbara svårighetsspikar utan att någon designar dem för hand.

**Väskan.** Rutnätet är 12 × 6, och föremålen tar plats efter sin egen form,
inte efter sin utrustningsplats: ett långsvärd är 1 × 3 och ett slagsvärd 1 × 4,
medan en stridsyxa är 2 × 3 och en krosshammare 2 × 4. Byter du ett vapen mot
ett du redan bär hamnar det gamla på den lucka det nya lämnade, så väskan inte
kastas om vid varje byte.

**Erfarenhet som klot.** XP bokförs inte längre direkt — den faller som klot på
marken där fienden stod, och du får den först när du går nära nog att suga upp
dem. Det gör räckvidd till en avvägning: slår du på håll eller kitar runt en
flock måste du gå tillbaka och sopa upp bytet. Valörerna syns på färg och
storlek — vit liten och stor, sedan gul, blå och lila — så du ser på marken vad
som är värt att hämta. Ett tungt byte delas i flera klot, och när fältet blir
fullt slås nya ihop med närliggande i stället för att strö ut mer grus.

**Loot.** Föremål droppar sällan — knappt ett per tjugo fällda vanliga fiender —
och vita skräpföremål faller nästan alltid bort helt. Guld kommer i färre men
tyngre högar. Allt du hittar plockas upp automatiskt när du går över det, men
något *du själv* släpper ligger kvar tills du gått ifrån det, så det går att
lägga ifrån sig ett vapen i vildmarken.

**Progression.** Nivåer 1 och uppåt, fyra attributpoäng och en skillpoäng per
nivå. Tre riktiga **skill-träd** (Stål, Frost, Uthållighet) — ett per flik — med fem skills
vardera i tre steg: två ingångar, två mellansteg som var för sig kräver en poäng
i sin förälder, och en kapsten som kräver båda mellanstegen. Steg 2 öppnar på
nivå 6, steg 3 på nivå 12. Plus synergier där skills stärker varandra.

**Nivåhöjning.** Spelet pausar och visar en bred ruta med attributen som fyra
brickor till vänster och **hela skill-trädet** till höger — inget ligger bakom
en knapp. Varje bricka säger rakt ut vad ett klick ger. Poängen läggs i en
väntande hög: du kan plocka tillbaka dem med minus och prova om, och först
*Lås in* skriver dem till karaktären. Attribut och skills låses in **var för
sig**, eftersom det är olika beslut. Du måste inte lägga dem alls; `Esc` tar dig
rakt tillbaka i striden och poängen ligger kvar.

Spelet öppnar inga rutor när du startar — du står i Frosthem direkt, med en
notis i hörnet i stället för en modal att klicka bort.

**Flera karaktärer.** Huvudmenyn listar dina karaktärer med nivå, antal fällda,
guld och när du senast spelade — ett klick och du är inne. *Skapa ny karaktär*
öppnar klasslistan (Barbaren är byggd; Jägaren och Frostkallaren står som
kommande). Allt sparas i webbläsarens `localStorage`, automatiskt vid
nivåhöjning, zonbyte och när du lämnar fliken, eller manuellt med `F5`.

Första karaktären får en kort genomgång i fem steg. Frågetecknet uppe till höger
(eller `F1`) tar upp den igen när som helst. Allt sparas i
webbläsarens `localStorage` — automatiskt vid nivåhöjning, zonbyte, köp och när
du lämnar fliken, eller manuellt med `F5`. Startskärmen erbjuder *Fortsätt* när
ett sparläge finns. Du återvänder alltid till Frosthem, eftersom byn är den enda
plats som inte genereras om.

**Övrigt.** Helgedomar med tidsbegränsade buffar, skattkistor, minimap som visar
stigar och vägstenar, jämförande tooltips, utrustningsdocka i kroppsform som i
D2, partiklar, blodavtryck, skärmskak och drivande snö.

**Snön i huvudmenyn.** 380 flingor, var och en med eget djup, egen storlek och
egen fallhastighet. Små flingor fångas hårdare av vinden än stora, varje flinga
har sin egen svängning och en långsam pulsering av farten (±38 %), och byiga
vindar kommer ur tre sinusvågor med olika period. De minsta ritas som prickar,
de största som roterande sexarmade stjärnor med en mjuk gloria.

## Arkitektur

```
index.html          canvas + DOM-overlay för HUD och paneler
styles.css          hela UI:t (paneler, orbs, tooltips) i CSS
src/
  core/             rng (seedad), math, input
  data/             items.js (bastyper + affixtabeller), monsters.js, skills.js
  entities/         player.js, monster.js — rena datastrukturer
  systems/          world (generering + stigar), spawn, ai, boss, combat,
                    loot, stats, inventory, save
  render/           camera, renderer (all canvas-ritning), fx (partiklar/siffror)
  ui/               hud, panels, tooltip — DOM, inte canvas
  game.js           speltillstånd + uppdateringsloop
  main.js           bootstrap, canvas-setup, rAF-loop
```

Ett par medvetna val:

- **DOM för UI, canvas för världen.** Inventarier, tooltips och paneler är
  hundra gånger enklare i HTML/CSS än ritade för hand i canvas.
- **Data skild från system.** Alla balanssiffror ligger i `src/data/`. Att
  ändra ett vapen eller ett monster kräver inte att man rör någon logik.
- **Typade ES-moduler.** Koden är JSDoc-typad med `checkJs` i `jsconfig.json`,
  vilket ger full typkontroll i editorn utan byggsteg. Node fanns inte på
  maskinen — filerna är strukturerade precis som ett TS-projekt, så migreringen
  till riktiga `.ts`-filer är mekanisk den dag du installerar Node.

## Kända avvägningar

- **Zoner genereras om.** Det är avsiktligt (återspelningsvärde), men det är
  också därför stadsportalen måste bevara zonen och varför sparningen alltid
  lägger dig i byn.
- **Bossen står utanför separationskraften.** Den vanliga logiken som hindrar
  monster från att stapla på varandra kunde putta bossen bort från spelaren i
  all oändlighet — det var därför den aldrig hann attackera. Nu har den en egen
  loop, och den vanliga separationen är dessutom taklistad.
- **Murar blockerar sikt, men bara de stora.** Block, klippor och byggnader
  stoppar svep, ytskador och pilar; träd och stolpar gör det inte. Gränsen går
  vid radie 22 — att låta småsaker blockera kändes godtyckligt i strid.
- **Avstickarens mur har alltid en port**, riktad dit sidostigen faktiskt kommer
  in (inte mot korsningen — stigen kröker sig). Verifierat med en
  översvämningssökning över 80 genererade zoner: kista, utgångar, vägsten och
  helgedomar går alltid att nå från entrén.

## Balansläge

Öppningen är verifierad med en enkel bot: en nivå-1-karaktär med startutrustning
vinner mot alla vanliga grupper i Bleka hedarna och tappar 20–50 % av livet på
vägen. Bossen tar ungefär en minut med rimlig utrustning. Mittensegmentet
(Vargpasset, nivå 5–9) är den del som är minst genomtestad.

Döden är medvetet mjuk: du vaknar i Frosthem och behåller allt. Straffet är
lätt att skärpa i `updatePlayer` i `src/game.js` när balansen sitter.

## Nästa steg

Rimlig ordning, med det som ger mest per timme först:

1. **Ljud.** Det största som saknas. Träffar, dödsljud och en vindslinga gör
   mer för känslan än någon grafisk uppgradering — särskilt nu när
   uthålligheten har en rytm som skulle må bra av att höras.
2. **Telegraferade specialattacker för vanliga elitmonster.** Bossen har dem nu;
   samma grepp på elitpacken skulle lyfta hela mittensegmentet.
3. **Sockets och runor**, som ger loot ett andra lager att gräva i.
4. **Fler klasser.** Jägaren och Frostkallaren finns skisserade; systemen är
   byggda för att ta emot dem.
5. **Svårighetsgrader** (Mardröm, Helvete) med motståndsstraff — D2:s
   billigaste sätt att göra allt innehåll relevant igen.
6. **Flera sparplatser.** Just nu finns en enda karaktär åt gången.
