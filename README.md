# Frosthem — Vandraren

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
| `←` `↑` `↓` `→` | Gå (`WASD` fungerar också) |
| — | Attacken sköter sig själv när en fiende är inom räckhåll |
| `1`–`6` | Skills |
| `Q` | Hälsodryck |
| `E` | Använd: tala, res, vägsten, portal, kista |
| `Mellanslag` | Undanrullning (osårbar mitt i rullningen) |
| `T` | Öppna stadsportal (och tillbaka igen) |
| `I` / `C` / `K` | Väska · Karaktär · Skills |
| `F5` | Spara nu |
| `F1` / `F2` | Hur man spelar · dölj snabblistan |
| `Esc` | Stäng paneler, annars paus- och sparmeny |

Styrningen är byggd för bärbar dator och **kräver ingen mus alls**: högerhanden
på piltangenterna, vänsterhanden på `1`–`6` och `Q`. Du siktar automatiskt på
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

**Resor.** Varje zon har en **vägsten** som du låser upp genom att röra vid den;
därefter kan du hoppa mellan alla upptäckta vägstenar. **Stadsportalen** (`T`)
tar dig till Frosthem och tillbaka till exakt samma plats — den bevarar zonen du
lämnade, inklusive monster och loot på marken, vilket är hela poängen när zoner
annars genereras om vid varje besök.

**Uthållighet.** Varje svep och varje skill kostar uthållighet, och *under strid
återhämtar du dig bara till 40 % av normal takt* — bryt kontakten så fyller den
på snabbt. Varje fälld fiende ger 8 tillbaka. Det gör hela stridsekonomin till
en avvägning: du kan rensa en flock om du träffar effektivt, men bomsvep och
tåligare fiender tvingar dig att backa och andas. Vilja höjer taket, snabbar upp
återhämtningen och gör svepen något billigare; tunga vapen kostar mer per svep.

**Fog of war.** Vildmarken börjar svart på kartan och avtäcks medan du går.
Minimapen minns terräng, stigar och det du hittat — men visar bara fiender som
är nära dig just nu. Byn är känd från början.

**Strid.** Svep med båge och räckvidd, omedelbar träffdetektion (responsivitet
före windup), knockback, kritiska träffar, blödning, frysning, bedövning och
livsdräneri. Flockarna är många och små — en hop snövargar är ett dussin
individer, inte fyra klumpar. Fienderna har fem arketyper med olika AI: laddare, närstrid,
distans och tunga varelser. De är avsiktligt aggressiva — det driver tempot.

**Bossen.** Jarl Hravn kör en egen AI med fyra **telegraferade** attacker:
*Frostsvep* (båge framåt), *Iskross* (markerad cirkel där du står — gå därifrån),
*Rimlans* (markerad linje, sedan en rusning) och *Kallar vålnader* vid 66 % och
33 % liv. Varje attack ritar sin träffyta på marken medan den laddar.

**Elit-packs.** Champions och elitmonster med slumpade modifierare — *Snabb,
Kraftfull, Frostbunden, Pansrad, Blodtörstig, Skyddad* — som kombineras fritt.
Det ger oförutsägbara svårighetsspikar utan att någon designar dem för hand.

**Loot.** Föremål droppar sällan — ungefär ett per tolv fällda vanliga fiender —
men allt plockas upp automatiskt när du går över det. Elitmonster, kistor och
bossen är de verkliga källorna. Full affix-motor: bastyp → sällsynthet → slumpade prefix/suffix, där
vilka affix-*nivåer* som kan rullas styrs av föremålets ilvl, som kommer från
monstrets nivå. Fem sällsynthetsgrader med egna färger, sex unika föremål med
fasta specialegenskaper, attributkrav som gatear vad du kan bära, och en
handlare som köper skräpet.

**Progression.** Nivåer 1 och uppåt, fyra attributpoäng och en skillpoäng per
nivå. Tre riktiga **skill-träd** (Stål, Frost, Uthållighet) — ett per flik — med fem skills
vardera i tre steg: två ingångar, två mellansteg som var för sig kräver en poäng
i sin förälder, och en kapsten som kräver båda mellanstegen. Steg 2 öppnar på
nivå 6, steg 3 på nivå 12. Plus synergier där skills stärker varandra.

**Nivåhöjning.** Spelet pausar och visar en ruta där du kan lägga attributpoäng
på plats — du behöver inte bryta en strid eller gå till byn för att bli starkare.
Du *måste* inte lägga dem: poängen ligger kvar, och `Esc` eller *Fortsätt* tar dig
rakt tillbaka in i striden.

**Karaktär och sparning.** Du namnger din vandrare vid start, och första
karaktären får en kort genomgång i fem steg. Frågetecknet uppe till höger (eller
`F1`) tar upp den igen när som helst. Allt sparas i
webbläsarens `localStorage` — automatiskt vid nivåhöjning, zonbyte, köp och när
du lämnar fliken, eller manuellt med `F5`. Startskärmen erbjuder *Fortsätt* när
ett sparläge finns. Du återvänder alltid till Frosthem, eftersom byn är den enda
plats som inte genereras om.

**Övrigt.** Helgedomar med tidsbegränsade buffar, skattkistor, minimap som visar
stigar och vägstenar, jämförande tooltips, utrustningsdocka i kroppsform som i
D2, partiklar, blodavtryck, skärmskak och drivande snö.

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
