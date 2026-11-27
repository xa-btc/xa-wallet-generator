import { VOCABULARY_ADDITIONS } from './vocabulary-additions.js';
// Curated address-search vocabulary. Phrases use joined spelling because addresses have no spaces.
// Sources and scope are documented in docs/word-library.md; these are terms, not endorsements.
export const WORD_GROUPS = {
  degen: `
    btfd btd hfsp jomo fudder fudders fudding fomoed fomoing hodler hodlers hodling
    shill shills shilled shilling
    diamondhands paperhands lasereyes nocoiner nocoiners bagholders bagholding
    cryptobro cryptobros cryptochad moonboys moonboi moonbags moonshots moonbound
    moonmission wenmoon wenlambo whenmoon whenlambo tothemoon uponly
    downonly sendor sendooor sellooor buyooor holdooor tradfi
    degenlife degenmode degenerate degenerates degensonly apemode apestrong apehard
    aping allin yolod yolos yolotrade gamble gambler casino gambool riskon riskoff
    exitliquidity roundtrip roundtripped roundtripper roundtripping copehard seethe
    coping bagged loaded stacked stacking conviction convicted thesis narrative
    narratives cult cultcoin cultcoins cultist cultists cabal cabals cabalcoin
    trench trenches trencher trenchers trenchwar trenchlife cooked cooking cook
    letitcook letbrocook devcook devsold devselling devdump devdumped devbased
    communitytakeover cto pvp pve koth jeet jeets jeeted jeeting jeeter jeeters
    bundler bundlers bundled bundling dexpaid dexboost boost boosted boostedcoin
    bond bonded bonding bondingcurve graduate graduated graduation migrate migration
    lockin lockedin rotator rotate rotation runner runners running multibagger
    tenbagger hundredbagger sendhigher higher higherlow generational riches generationalwealth
    retire retired retirement freedommoney fyoumoney moneyglitch
    free moneyglitch infinite bidmore buythedip dipbuyer dipseller topseller topbuyer
    topblast topblaster bottomseller capitulate capitulation capitulated capitulating
    doom doomer doomers doomposting blackpill redpill bluepill whitepill hopemaxxing
    euphoric euphoria delusional delulu rugpull rugpulls rugger ruggers ruggedagain
  `,
  social: `
    gmgm gngn gmgn gmon gmfrens gmser gmsir gmdegen gmdegens goodmorning goodnight
    frenly frengroup frenarmy fam fams squad gang ganggang tribe crew frenlife
    frenchain sir sirs sers bro bros bruh brah homie homies lads lad bois boi
    frenmaxxing anonarmy anonszn szn altszn memeseason memezn nftszn bullszn
    gmwagmi gmi ygmi weallgmi wgmi agmi gfy iykyk iykykbro idk idc
    imo imho irl afk brb gg ggs ggez ez ezpz ezwin ezmoney kek keks kekw kekl
    lol lols lmao lmfao rofl lul lulz pog pogs pogu pogger poggers pepelaugh
    pepehands pepesad peepo feels feelsgood feelsbad feelsgoodman feelsbadman
    sadge copege monka monkas monkaw prayge kekwait kekking kekistan keklord
    smol smolcap smolbrain bigbrain smoothbrain galaxybrain brainlet gigabrain
    gigabased megabased gigasend megasend gigaape gigawhale gigawealth gigapump
    godcandle godmode godsend godtier godroll godwallet gigachads chads chadmode
    gigastacy stacy wojak doomerwojak zoomer midwit midcurve bellcurve
    touchgrass grass outside terminallyonline chronicallyonline posting poster
    lurk lurker lurking lurkers lurkmode ratio ratioed copepost ragebait bait
    copypasta pasta copypastas memeable memetic memetics memelord memeking memequeen
    vibesonly goodvibes vibecode vibecoding vibecoder aura aurafarm aurafarming
    rizz rizzler rizzy rizzo swag swagger flex flexing flexer drip drippy dripped
    bussin sus sussy amogus amongus skibidi brainrot basedaf real realone frfr
    ngl tbh smh wtf wth omfg omg ffs fml idgaf dgaf gtfo stfu fack fuk fkn
  `,
  trading: `
    bidask bids asks bidding bidder bidded bidwall sellwall buywall orderbook
    long longs longing short shorts shorting longed shorted longonly shortonly
    leverageup lev lever margin margins crossmargin isolated leveragejunkie
    longrekt shortrekt liq liqs liquidated liquidation liquidations liqprice liqmap
    stop stops stoploss takeprofit trailingstop slippage spread spreads tick ticks
    taker maker makers takers marketmaker marketmaking funding fundingrate basis
    premium discount contango backwardation openinterest oi cvd delta gamma vega theta
    hedge hedged hedger hedging options option calls puts call put strike expiry
    futures futurestrader scalp scalps scalper scalping swing swings swingtrade
    daytrade daytrader trader traders trading quant quants algo algos algotrade
    momentum trend trending trendline uptrend downtrend range ranging chop choppy
    chopfest crab crabbing crabmarket sideways squeeze shortsqueeze longsqueeze
    squeezeup squeezeout squeezeplay breakouttrade breakdown fakeout bulltrap beartrap
    stophunt stoprun wickup wickdown wickoff wickout wickcity wickfill liquiditygrab
    bounce deadcat deadcatbounce reversal reverse vshape vshaped ushape recovery
    retrace retracement pullback retest reclaim resistance demand supplyzone demandzone
    supportzone buyzone sellzone accumulation accumulate distribution distribute
    athsoon newath newhigh higherhigh higherlows lowerhigh lowerlow price priceaction
    discovery pricediscovery parabolic parabola pumpit pumponomics pumpamentals
    marketcap microcap smallcap midcap largecap lowcap nanocap bluechip bluechips
    fdv mvrv nvt nav twap vwap ema sma rsi macd atr obv fib fibs fibonacci
    chartist charting technicals fundamentals catalyst catalysts breakoutszn
    pnlgreen pnlred profitmax profitonly breakeven unrealized realized drawdown
    drawdowns riskreward sharpe sortino hedgefund bankroll position sizing portfolio
    bagsize moonmoney drypowder convictionplay asymmetry asymmetric bet bets betting
    dcaout dcain buyback buybacks buyburn buyandhold brrr brrrr moneygoesbrrr printergoesbrrr
  `,
  defi: `
    amm clmm dlmm vamm cpmm cfmm dexes cex cexes aggregator aggregation router routing
    route routes pools pooler pooling lpool lptoken lplock lpburn lpfee lper lping
    yieldfarm yieldfarmer yieldfarming yieldmax yieldvault farmed farmer farmers
    farming farmtoken reward rewards incentive incentives emission emissions bribe bribes
    ve vefee vetoken votelock votelocked vote voting governance governor proposal quorum
    daoist daos daogov multisig signer signers cosigner threshold timelock escrow
    staking staked unstake unstaked restake restaked restaking liquidstaking lst lrt
    receipt redeem redemption redeemable collateral collateralized overcollateralized
    undercollateralized borrower lender lending borrowing borrowrate lendrate utilization
    flash flashloan flashmint flashswap loop looping looper leveragefarm deltahedge
    deltaneutral neutral carry carrytrade yieldspread basisyield stablecoin stablecoins
    depeg repeg peg pegged unpeg pegkeeper seigniorage rebase rebased rebasing reserve
    reserves backing backed overbacked underbacked treasury treasuries tbill tbills rwa
    tokenized tokenization wrapper wrapped wrap unwrap wsol weth steth wsteth cbeth
    reth jitosol msol bsol jupsol susd usde susde pyusd usds susds frax lusd crvusd
    syrup usdd gusd tusd fdusd eurc eurt euroc eurs dola mim eurt usd0 usd1 eurcv
    proofreserve proofofreserves attestation attest oracle oracles feedprice chainfeed
    crosschain omnichain multichain interoperability bridgefee bridgepool bridgeburn
    mintburn bridged canonical native bridgeout bridgein solver solvers intents intent
    auction batch batchauction dutchauction rfq rfs swapper swapping swapped swapfee
  `,
  infrastructure: `
    evm svm eoa eip erc erc20 erc721 erc1155 spl spltoken token2022 bep bep20
    bip bip32 bip39 bip44 bip84 bip86 utxo utxos segwit taproot schnorr merkle
    merkletree bech32 base58 base64 ecdsa eddsa ed25519 secp hashcash hashpower
    hashrate hashing hasher sha sha256 keccak scrypt noncegrind difficulty miningpool
    blocktime blockspace blocksize blockhash blockheight finality finalized confirmations
    confirm mempool feeest feequote dustlimit dusting satsvbyte lightning lnurl lnaddr
    channel channels watchtower routingfee bolt bolts rgb rgbpp sidechain sidechains
    fork forks forked hardfork softfork reorg reorgs orphan orphanblock coinbaseblock
    coinjoin payjoin coincontrol batchsend psbt xpub xpriv xprv pubkey privkey keypair
    keygen mnemonic entropy passphrase seedphrase recoveryphrase coldwallet hotwallet
    airgap airgapped hardwarewallet watchonly readonly keystore keyvault backup restore
    sign signed signing signature signatures verifyproof checksum checksumaddr
    accountabstraction smartaccount smartwallet paymaster bundlergas gasless sponsored
    metatx userop entrypoint gaslimit gasprice basefee priorityfee blob blobs blobspace
    danksharding sharding shard shards shardchain beacon beaconchain beaconnode
    rollups optimistic zkrollup zkevm zksync zkproof zkvm snark stark starks
    snarks zkml zkapp zkapps zkbridge validium volition plasma sequencer sequencers
    prover provers proofsystem fraudproof validityproof challenge challenger dispute
    dataavailability da avail calldata storage compute runtime opcode opcodes bytecode
    solidity vyper rust move wasm ewasm solc anchor idl abi api rpc grpc ws wss
    websocket endpoint archive archival fullnode lightnode lightclient client consensusnode
    execution consensuslayer executionlayer settlement modular monolithic appchain
    subnet supernet parachain parathread relaychain relay relayer relayers gossip peer
    peers p2p permissioned permissionlessnetwork trustminimized censorshipresistant
  `,
  nft: `
    jpeg jpegs jpg jpgs pfp pfps avatar avatars mintpass mintlist allowlist whitelist
    wl al presale publicsale dutchmint freemint stealthmint fairmint fairlaunch
    stealthlaunch launch launchpad launchpool launchtoken mintout mintedout soldout
    premint postmint mintprice mintfee mintcount minter minters mintedby minting
    reveal revealed unrevealed prereveal postreveal metadata trait traits traitfloor
    traitrank rarity raretrait legendary mythic mythical uncommon ultrarare superrare
    grail grails grailpiece oneofone genesispass genesisdrop edition editions limited
    collection collections collector collectors collecting provenance generative genart
    onchainart pixelart pixelpunk pixelape artblocks fxhash autoglyph autoglyphs fidenza
    squiggle squiggles chromie chromies doodle doodles azuki beanz pudgy pengu penguin
    penguins lilpudgy bayc mayc bakc boredape mutantape cryptopunk cryptopunks meebit
    meebits clonex moonbird moonbirds mfers milady remilio degod degods yoots madlad
    madlads clayno claynosaur claynosaurz smb solmonkey tensor tensorians famousfox
    okbear okaybear okaybears bearsclub ordinalpunk bitcoinpunk inscriptions brc20
    stamp stamps src20 atomicals arc20 rarepepe rarepepes counterfeit derivative
    derivativeart royalty royalties marketplace listing listings listed delist offer
    offers floorprice floorbid floorask sweeper floorsweep undercut bidfloor sellfloor
    sweepthefloor artdrop airdropped claim claimable claimed claimdrop claimer
    claimers snapshot soulbound sbt soul tokenbound burnmint burntomint redeemdrop
  `,
  memes: `
    dogecoin shiba shibainu babydoge babypepe babybonk babyshib minipepe minidoge
    pepearmy pepecoin pepecash pepeking pepequeen apu apustaja apuarmy pepo pepos
    grok grokking grokcoin elon elondoge dogelon marscoin akita kishu hokk hoge hogearmy
    samoyed samo myro bome bookofmeme sloth slothana slerf mother daddy neiro neiroeth
    moodeng moo deng pnut peanut goatus goatcoin fartcoin fart fartboy fartcat
    spx spx6900 gme gamestop amc roaringkitty kitty kittycat michi mumu mumubull
    fwog fwogs fwen fwens wawa wawas giga gigaeth gigasol gigacat gigadoge
    tremp doland boden dolan trump melania maga politifi people
    constitutiondao notcoin dogs ham hammy hamster hamstercoin tap tapper tapping
    toshi tybg normilio degenbase higherbase ski skimask basedbrett andy landwolf
    wolfcoin hoppy hop hopcat hopcats bob robert wenwen wenwif dogwifhat catwifhat
    dogwifcat catwifdog wifhat hats hat wifcat wifdog wifpepe wifbonk pop popdog
    popfrog poppepe ponk punky pook pookie pooks pooh pingu pingo ping pong pippin
    ponzi ponzinomics ponzicoin scam scamcoin scammer scammers scamwick scamwicks
    scamper rugrat rugrats rugcheck unruggable antirug norug norugs rugproof rugfree
    honeypot honey honeybadger badger badgers honeytrap squid squidgame goblin goblins
    gremlin gremlins goblintown goblintime troll trolls trollface trollcoin trollbox
    sat satoshibot pizza pizzaday pizzacoin bitcoinpizza bitconnect bitcorn corn corns
    corncoin popcorn dogebonk bonkbot bananagun banana banano bananas monkey monkeys
  `,
  politics: `
    aipac
    america first americafirst groyper groypers
    nick nicholas fuentes nickfuentes nicholasfuentes afpac cozy cozytv groyperwar groyperwars
    politics political civic civics citizen citizens citizenship public republic
    democracy democratic democrat democrats republican republicans gop dnc rnc
    liberal liberals liberalism conservative conservatives conservatism progressive
    progressives progressivism libertarian libertarians libertarianism socialist
    socialists socialism communist communism capitalist capitalism anarchist anarchism
    centrist centrism moderate moderates populist populism nationalist nationalism
    federal federalism federalist secular secularism pluralism bipartisan nonpartisan
    partisan coalition caucus party platform manifesto mandate opposition incumbent
    election elections elect elected electorate electoral voter voters votingrights
    ballot ballots ballotbox poll polls polling pollster precinct turnout recount
    runoff primary primaries referendum plebiscite candidate candidates campaign
    campaigner canvass canvassing debate debates endorse endorsement nomination nominee
    delegate delegates convention swingstate swingvote landslide redstate bluestate
    senate senator senators congress congressional congressman congresswoman house
    parliament parliamentary minister premier president presidency presidential
    vicepresident cabinet mayor council councillor councilor alderman assembly
    legislature legislator legislative executive judiciary judicial justice court
    supreme supremecourt scotus potus flotus vp mp pm whip speaker backbench
    law laws legal bill bills statute ordinance amendment constitution constitutional
    charter rights civilrights liberty liberties equality equity suffrage enfranchise
    veto filibuster cloture hearing committee subcommittee oversight impeachment
    impeach pardon amnesty termlimit termlimits redistrict gerrymander district
    policy policies reform regulation deregulation tax taxes taxation tariff tariffs
    budget deficit surplus debt spending austerity welfare healthcare education
    immigration immigrant asylum border borders diplomacy diplomat diplomatic
    treaty treaties alliance allies nato un eu summit sanction sanctions embassy
    ambassador sovereignty sovereign peace ceasefire truce accord accords detente
    protest petition activist activism grassroots lobby lobbying lobbyist union
    labor labour solidarity strike boycott rally rallies march movement resistance
    transparency accountability ethics integrity watchdog civicduty publicservice
    left leftwing right rightwing center centre blue red green greens tory tories
    whig whigs brexit remain leave dem dems rep reps neocon neolib neoconservative
    neoliberal socialdemocrat socialdemocracy greenparty labourparty likud knesset
    zionism zionist antizionism antizionist twostate onestate peaceprocess
    biden harris obama clinton bush reagan carter kennedy lincoln washington
    bernie sanders aoc pelosi vance desantis newsom starmer sunak thatcher
    churchill macron merkel scholz trudeau modi netanyahu rabin peres golda
  `,
  jewish: `
    goyum
    jew jews jewish judaism hebrew hebrews ivrit yiddish ladino judeo judaica
    ashkenazi ashkenazim sephardi sephardic sephardim mizrahi mizrahim romaniote
    hasid hasidic hasidim chasid chasidic chasidim chabad lubavitch litvak litvish
    haredi haredim orthodox modernorthodox masorti reconstructionist renewal
    rabbi rabbis reb rebbe rebbetzin rav rabban rabbanim rabbinic rabbinical
    cantor chazzan hazzan gabbai shamash shammash kohen kohanim cohen levi levite
    torah tanakh tanach talmud mishnah mishna gemara midrash halakha halacha
    aggadah agadah kabbalah kabalah zohar tanya chumash siddur machzor sefer
    parsha parashah parashat haftorah haftarah drash dvar divrei commentary
    mitzvah mitzva mitzvot mitzvos teshuvah tzedakah tzedaka chesed hesed emunah
    bitachon kavod kavana kavanah kedusha kedushah shekhinah shechinah neshama
    nefesh ruach chai chaim lchaim shalom sholom ahava tikvah emet tikkun
    tikkunolam olam olamhaba derech derecheretz shma shema amen amein hallel
    hallelujah baruch bracha beracha berakhah brachot berakhot todah toda
    modehani adonai hashem elohim elohainu elohenu shaddai melekh melech
    shabbat shabbos sabbath shabbatshalom gutshabbos havdalah kiddush kaddish
    minyan minyanim aliyah aliyot bima bimah aron ark ner nertamid mezuzah
    mezuzot tefillin tallit tallis tzitzit tzitzis kippah kippa kippot yarmulke
    synagogue shul temple beit bet beitmidrash yeshiva yeshivah kollel cheder
    chavruta havruta shiur shiurim daven davening tefillah tefila amidah musaf
    shacharit shacharis mincha minchah maariv arvit selichot selichos tashlich
    pesach passover seder seders haggadah haggada matzah matzo matzoh afikoman
    charoset haroset maror karpas chametz chometz dayenu omer lagbaomer shavuot
    shavuos sukkot sukkos sukkah sukka lulav etrog arba aravah hadas hoshanah
    roshhashanah yomkippur yomtov chag chagsameach simchattorah sheminiatzeret
    hanukkah chanukah chanukkah hanukah menorah hanukkiah chanukiah dreidel sevivon
    purim megillah megilla esther mishloachmanot hamantaschen hamentashen grogger
    tubishvat tishabav fast taanit shofar tekiah teruah shevarim tekiahgedolah
    nisan nissan iyar sivan tammuz tamuz av elul tishrei tishri cheshvan
    kislev tevet shevat adar adarbet roshchodesh luach
    kosher kasher kashrut kashrus pareve parve fleishig milchig hechsher glatt
    challah challot chalah bagel bagels bialy bialys babka rugelach rugelakh
    latke latkes kugel knish knishes kreplach cholent chulent tzimmes tsimmes
    gefilte brisket lox schmear schmeer sufganiyot sufganiyah bourekas borekas
    malawach jachnun shakshuka sabich tahini tehina halvah halva falafel hummus
    simcha simchah mazel mazel tov mazeltov mazal mazaltov nachas naches
    mensch mensches menschlichkeit mishpacha mishpachah bubbie bubbe bubba
    zayde zaide zaydie abba ima imma saba savta ach achi achot ben bat
    bar batmitzvah barmitzvah brit bris britmilah mohel chuppah huppah ketubah
    ketuba kallah chatan chattan shidduch shidduchim shevabrachot aufruf
    shiva shivah yahrzeit yizkor levaya matzevah chevra chevrah chevrekadisha
    schlep schlepp schmooze shmues kvell kvelling kvetch kvetching chutzpah
    chutzpa schtick shtick spiel shpiel oy oyvey gevalt nu tachlis takhlis
    balabusta balaboosta heimish haymish mamish mamash shtetl shtetls klezmer
    nigun niggun nigunim piyut piyyut piyutim zemirot zmirot hora freilach
    sabra kibbutz kibbutzim moshav moshavim ulpan aliyot yerushalayim jerusalem
    israel yisrael eretz eretzyisrael zion tzion judah yehuda judea galilee
    tzfat safed tiberias teverya hebron chevron telaviv haifa negev masada
    avraham abraham yitzchak isaac yaakov jacob moshe moses aharon aaron
    sarah rivka rebecca rachel leah miriam david dov shlomo solomon shimon
    yosef joseph yehoshua joshua dan daniel binyamin benjamin naomi ruth
    rashi rambam ramban maimonides hillel shammai akiva rabi saadia
    achla adloyada adonolam agristada aleichemshalom aleinu alenu almodrote amba anava
    anavah animzemirot arak aravos aravot arbakanfes arbakanfos arbakanfot ashrei atara
    atarah avinumalkeinu avnet avoda avodah avodas avodat avodathashem avot baalteshuva
    baalteshuvah badchan badchen badeken balagan bamidbar bandana barech bashert bedeken
    bedikaschometz bedikatchametz beetroot beitdin beitknesset beitzah bekeshe bekishe bekisheh bekitche
    bekitshe benching beneimitzvah bentch bentching bereishit bereshit beret besamim beseder
    beshert betdin bethdin bethknesset bevakasha bialystoker biberhat bigdeikehunah bigdeikodesh bimuelos
    birkat birkathamazon biurchametz biurchometz bliayinhara bnaimitzvah bneimitzvah bnotmitzvah bokertov borei
    boyos boyoz breastplate bridalveil britbat bubbeleh bubeleh bumuelos bunuelos caftan
    casquette chagim chalaka chalakah challahboard challahcover chanukkiah charoseth chasidut chassid
    chassidic chassidim chassidus chaval chavalalhazman cholhamoed choppedliver choshen chrain chuppas
    chuppot coatofmanycolors daf dafina dafyomi davka dayan dayanim derash derasha
    derashot devarim deveikus devekut drasha drashot dugri dvarim dvekut efod
    eicha eichah einkeloheinu ephod erev erevpesach erevshabbat erevshabbos erevtov eruv
    eruvin fabrengen farbrengen farfel fargin farginen fasoulia fassoulia fedora fenugreek
    finjan fishballs flanken fritada fritas frock frockcoat gartel gartels gartlech
    gebrochts gebrokts gefiltefish gehakte gehakteleber geirut geniza genizah ger gerut
    geschmack geshmack geshmak gesundheit gevil gezunt giyur goldkaftan gribenes hadamah
    hadar hadassim hadran haetz hafrashaschallah hafrashatchallah hagafen hakafos hakafot hamantasch
    hamantash hamentash hamim hamin hamotzi hanukiah hanukkiyah haroseth hasidut havdala
    havdalahcandle havdalla havdoleh hawaij hawayej headcovering headscarf headscarves headwrap headwraps
    hefsektaharah helzel herring hilba hilbeh hisbodedus hitbodedut hitbonenut hoichehat holiptzes
    holishkes homburg horseradish hoshana hoshanarabbah hoshanos hoshanot hoshen huevoshaminados iyov
    iyyov kabbalatshabbat kaftan kahve kapel kaporet kapota kapotah kapote kappel
    kapporet kasha kashavarnishkes kashket keinayinhara kerchief keter ketertorah ketonet ketoneth
    ketonetpasim ketonetpassim ketubot khreyn kibbeh kichel kichels kichlach kiddushcup kiddushlevana
    kimchadepischa kinahora kinder kinderlach kinderlekh kinehora kippahs kippas kishka kishke
    kisuirosh kitel kitniyos kitniyot kittel kittelrobe kittels kitzur kitzurshulchanaruch klaf
    klezmers klezmorim knaidel knaidlach kneidel kneidlach kohelet kolnidre kolnidrei kolpik
    kolpiks korech kubana kubaneh kubbe kubbeh kugelach kumzits kumzitz kvater
    kvaterin kvatter lacefront lachuch lahoh lailatov lashon lashonhara latkele laylatov
    lchadodi lechadodi lechem lechemishneh lecker lehitraos lehitraot leil leilseder lekach
    lekhadodi limonana lockshen lokshen lokshenkugel luchen maamoul maamul maggid maggidmishneh
    mahnishtanah malabi mamaleh mame mamele mandelbread mandelbrot maotchitim mashgiach mashgichim
    mashpia mashpiim matanoslaevyonim matanotlaevyonim matzahball matzahshmurah matzoball mayim mayimacharonim mayimchayim
    meil meilkatan melacha melachos melachot melakhah melamdim melamed melavemalka melavemalke
    mezonos mezonot mezuzos michnasayim middos middot migbaat mikva mikvah mikvaot
    mikveh mimouna minttea mishlei mishloachmanos mishnaberurah mishnahberurah mishnayos mishnayot mishnehtorah
    mitpachat mitpachot mitznefet mitzvahboy mitzvahgirl mitzve moadim modestdress modestfashion modesty
    moed motzi moufleta mufleta muhallabia muktzah muktzeh musar mussar mussarniks
    nana negelvasser neila neilah netilat netilatyadayim nida nidda niddah nirtzah
    noodlekugel oneg onegshabbat onegshabbos ozneihaman ozneihomon pardes parochet parokhet payos
    payot peiyos peot pesak peshat petcha petiltekhelet peyes peyos peyot
    pickledherring pickles pidyonhaben pilpul pirkeavot pirkeiavot pitom platchigehat pletzel ponchkes
    ponim poohpoohpooh posek poskim pretzel priestlygarments psak pshat ptcha punim
    rachtzah ravakiva rechilus rechilut rekel rekels rekl remez responsa rimonim
    rogalach rogalik roshyeshiva sababa sabbathstew sachlav sahlab sambousak sambousek sambusak
    sandak sandek savlanut schach schmaltz schug sefertorah sekhakh selicha selichah
    seuda seudah seudatmitzvah seudatpurim seudos seudot sfenj sfinj shaatnez shabbatclothes
    shabbosbekishe shabbosclothes shalachmanos shalomaleichem shaloshseudos shames shammes shatnez shayna shaynapunim
    shaytel shehakol sheitel sheitels sheitlach sheminiatzeres shemot sheyn sheyne sheynepunim
    sheytel shiralhamaalot shirhamaalot shirhashirim shirshelyom shminiatzeres shmirat shmirathalashon shmot shmura
    shmurah shmuramatzah shomer shomershabbat shomershabbos shomrim shpitzel shpitzels shpitzlech shrouds
    shtibel shtibl shtiblach shtiblakh shtiebel shtieblach shtreimel shtreimels shtreimlach shtreimlech
    shulchanaruch shulhanarukh sidecurls sidelocks sifrei sifreitorah simchatbat siyum siyumim skhakh
    skhina skhug skullcap slicha snood snoods sod sofer soferstam sofrim
    sourpickles spodik spodiks srug stam stripedkaftan stuffedcabbage sufganiot sugya sugyos
    sugyot tachanun tachrichim tahara taharah tahor takhrichim takhrikhim talit talith
    talitot tallisgadol talliskatan tallitbag tallitgadol tallith tallitkatan tallitot talmid talmidchacham
    talmideichachamim talmidim tamei tate tateleh tatte tayglach tbit tchelet tebit
    techelet tefillinbag tefillot tefilot tehilim tehillim teiglach tekhelet tekheletfringe tenaim
    tenoyim teshuvot tichel tichels tisch tish tishbekishe tsitsis tsitsit turban
    tzafun tzenius tzeniut tzimis tzitz tzitzisbag tzitziskatan tzitzitfringes tzitzith tzitziyot
    tznius tzniut unetanetokef upsheren upsherin urchatz ushpizin varnishkes vayikra vidui
    viduy whitekittel wig wigs yachatz yad yadayim yalla yamaka yapchik
    yarmulka yarmulkeh yarmulkes yerushalmikaftan yerushalmikugel yetzer yetzerhara yetzertov yiddishe yiddishekop
    yiddishemame yigdal yofi yomtovclothes zerizut zeroa zevedhabat zhoug zhug zimmun
    zimun zise ziskeit zisser
  `,
};

WORD_GROUPS.degen += ' '+VOCABULARY_ADDITIONS.crypto.join(' ');
WORD_GROUPS.politics += ' '+VOCABULARY_ADDITIONS.politics.join(' ');
WORD_GROUPS.jewish += ' '+VOCABULARY_ADDITIONS.jewish.join(' ');

export const EXTRA_WORDS = [...new Set(Object.values(WORD_GROUPS).flatMap(group => group.trim().split(/\s+/)))];
