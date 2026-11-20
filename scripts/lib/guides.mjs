// Guider (artiklar) som svarar på vanliga frågor. Varje guide länkar till relevanta prylar.
// Håll texten faktabaserad: inga betyg, inga påhittade tester. Där regler varierar – hänvisa till källan.

export const GUIDES = [
  {
    slug: 'powerbank-pa-flyget',
    emoji: '✈️',
    title: 'Powerbank på flyget – regler och tips',
    desc: 'Får du ta med en powerbank på planet? Så räknar du ut wattimmar, vad som gäller i handbagaget och vad du ska kolla med flygbolaget.',
    kicker: 'Resa',
    products: ['powerbank-20000', 'universell-reseadapter', 'usb-c-kabel-flatad'],
    sections: [
      ['Kort svar', [
        'Powerbanks ska ligga i handbagaget – aldrig i incheckat bagage. Under 100 Wh är tillåtet hos de flesta flygbolag. Mellan 100 och 160 Wh krävs oftast flygbolagets godkännande, och över 160 Wh är inte tillåtet alls.',
      ]],
      ['Så räknar du ut wattimmar', [
        'På powerbanken står kapaciteten oftast i mAh. Wattimmar räknar du ut så här: mAh × spänning ÷ 1 000. Batterierna har nästan alltid 3,6 eller 3,7 V.',
        'Exempel: 20 000 mAh × 3,7 V ÷ 1 000 = 74 Wh. Det är under gränsen på 100 Wh. Ofta står wattimmarna även tryckta på själva powerbanken.',
      ]],
      ['Kolla flygbolagets egna regler', [
        'Flera flygbolag har infört egna regler, till exempel att man inte får använda eller ladda powerbanken under flygningen, eller att den måste ligga synlig och inte i hatthyllan. Läs alltid ditt flygbolags aktuella regler innan du åker.',
      ]],
      ['Tips inför resan', [
        'Ladda powerbanken hemma, så slipper du leta uttag på flygplatsen.',
        'Skydda kontakterna, till exempel i en egen ficka, så att inget metallföremål kortsluter dem.',
        'Ta med en kort kabel som klarar snabbladdning – det sparar plats.',
      ]],
    ],
  },
  {
    slug: 'hur-manga-watt-laddare',
    emoji: '⚡',
    title: 'Hur många watt behöver laddaren?',
    desc: 'Mobil, surfplatta eller laptop – så vet du vilken effekt laddaren behöver, varför kabeln spelar roll och om en större laddare är farlig.',
    kicker: 'Laddning',
    products: ['usb-c-laddare-65w', 'usb-c-kabel-flatad', 'powerbank-20000'],
    sections: [
      ['Kort svar', [
        'De flesta mobiler klarar sig med 20–45 W. Surfplattor och tunna laptops vill ofta ha 30–65 W, och större laptops 90 W eller mer. En laddare på 65 W täcker därför mobil, surfplatta och många laptops.',
      ]],
      ['Är en starkare laddare farlig?', [
        'Nej, inte med USB-C Power Delivery. Laddaren och enheten kommer överens om hur mycket effekt som ska levereras, så mobilen tar bara det den klarar. En för svag laddare är problemet – då laddar enheten långsamt, eller inte alls när den används.',
      ]],
      ['Kolla vad din enhet behöver', [
        'Titta på originalladdaren eller i tillverkarens specifikation. Står det 90 W på din laptops laddare laddar den långsammare med 65 W, särskilt när du jobbar tungt.',
      ]],
      ['Kabeln avgör också', [
        'En vanlig USB-C-kabel klarar 60 W (3 A). För mer än så behövs en kabel märkt för 5 A – 100 W, eller 240 W för de nyaste laddarna.',
      ]],
      ['Flera portar delar på effekten', [
        'En laddare med flera portar anger oftast den totala effekten. Laddar du två saker samtidigt får varje port mindre. Tillverkaren brukar visa hur effekten fördelas.',
      ]],
    ],
  },
  {
    slug: 'sa-skapar-du-en-tavelvagg',
    emoji: '🖼️',
    title: 'Så skapar du en tavelvägg',
    desc: 'Steg för steg: planera, välj ramar, mät avstånd och häng en tavelvägg som ser genomtänkt ut – utan onödiga hål i väggen.',
    kicker: 'Inredning',
    products: ['posters-och-tavlor', 'tavelramar', 'vagghyllor'],
    sections: [
      ['1. Välj en röd tråd', [
        'En tavelvägg ser lugn ut när något går igen: samma ramfärg, samma färgskala i motiven eller samma typ av bilder. Välj gärna en större tavla som blickfång och bygg runt den.',
      ]],
      ['2. Planera på golvet', [
        'Lägg ut ramarna på golvet och flytta runt tills du är nöjd. Ta ett foto, så minns du placeringen.',
      ]],
      ['3. Gör pappersmallar', [
        'Klipp ut papper i samma storlek som ramarna och fäst dem på väggen med maskeringstejp. Då ser du helheten och kan markera var spiken eller kroken ska sitta innan du borrar.',
      ]],
      ['4. Avstånd och höjd', [
        'Håll samma avstånd mellan ramarna, ofta 5–8 cm. Låt mitten av hela gruppen hamna runt 145–155 cm från golvet, eller anpassa efter möbeln under.',
      ]],
      ['5. Häng rätt', [
        'Använd vattenpass. Välj krok eller plugg efter väggtyp och ramens vikt. Hyr du och får inte borra finns häftremsor för tavlor – kontrollera hur mycket de tål.',
      ]],
    ],
  },
  {
    slug: 'ergonomi-hemmakontoret',
    emoji: '💻',
    title: 'Ergonomi på hemmakontoret – på budget',
    desc: 'Enkla justeringar som gör jobbet vid köksbordet eller skrivbordet skönare: skärmhöjd, tangentbord, ljus och pauser.',
    kicker: 'Dator & kontor',
    products: ['laptopstall-aluminium', 'mekaniskt-tangentbord', 'ergonomisk-mus', 'webbkamera'],
    sections: [
      ['Skärmen i ögonhöjd', [
        'Överkanten av skärmen bör hamna ungefär i ögonhöjd eller strax under, och skärmen en armlängd bort. Med en laptop är det lättast att lösa med ett laptopställ.',
      ]],
      ['Separat tangentbord och mus', [
        'Står laptopen högt hamnar tangentbordet för högt. Ett separat tangentbord och en mus gör att axlarna kan sjunka och armbågarna hamna i ungefär rät vinkel.',
      ]],
      ['Stol och fötter', [
        'Fötterna ska nå golvet eller ett fotstöd, och ryggen ha stöd. En kudde i svanken kan hjälpa på en vanlig köksstol.',
      ]],
      ['Ljus utan reflexer', [
        'Ställ skärmen så att fönstret är vid sidan om, inte bakom eller framför. Då slipper du reflexer och bländning. I videomöten syns du bäst med ljuset framifrån.',
      ]],
      ['Rör på dig', [
        'Den bästa ställningen är nästa. Res dig och rör på dig en stund varje timme. Har du ont som inte går över är det klokt att prata med vården eller en ergonom.',
      ]],
    ],
  },
  {
    slug: 'mysbelysning-vintermorkret',
    emoji: '🕯️',
    title: 'Mysbelysning i vintermörkret',
    desc: 'Så lägger du upp belysningen i lager, väljer rätt färgtemperatur och använder smarta lampor och LED-ljus för ett ombonat hem.',
    kicker: 'Hem & inredning',
    products: ['smarta-led-lampor', 'led-ljus', 'smart-kontakt-energimatning'],
    sections: [
      ['Belysning i lager', [
        'Ett rum blir mysigt med flera ljuskällor på olika höjd: allmänbelysning, lampor där du läser eller lagar mat, och stämningsljus som fönsterlampor och ljus. En ensam taklampa ger hårt, platt ljus.',
      ]],
      ['Varmvitt ljus', [
        'Färgtemperaturen anges i kelvin. Runt 2 700 K ger ett varmt, gulaktigt sken som passar vardagsrum och sovrum. Högre värden, 4 000 K och uppåt, ger ett kallare ljus som passar arbetsplatser.',
      ]],
      ['Dimra och schemalägg', [
        'Med smarta lampor eller dimbara lampor kan du sänka ljuset på kvällen. Ett schema som tänder fönsterlamporna när det mörknar gör att hemmet möter dig upplyst.',
      ]],
      ['LED-ljus i stället för levande ljus', [
        'Flamfria LED-ljus ger samma mysiga sken utan brandrisk – bra i fönster, i barnfamiljer och hos husdjursägare. Många har timer, så de tänds av sig själva varje kväll.',
      ]],
    ],
  },
];
