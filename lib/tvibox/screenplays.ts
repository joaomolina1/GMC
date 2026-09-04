import type { Screenplay, SeriesSlug } from "./types";

/**
 * Argumentos dos primeiros episódios TVI BOX.
 *
 * Regras de produção:
 * - Vertical 9:16, ≤ 90 s por episódio (8 s de abertura + extensões de 7 s — limites do Veo 3.1).
 * - Diálogo em português europeu (nunca brasileiro): "tu", "estás", "telemóvel", "a fazer".
 * - Apenas atores gerados por IA; nomes e caras são fictícios.
 * - Cada episódio termina num cliffhanger com corte seco.
 * - Descrições de plano em inglês (linguagem nativa dos modelos de vídeo); falas em PT-PT.
 */

const PT = "European Portuguese (Portugal accent, natural Lisbon cadence, never Brazilian)";

export const SCREENPLAYS: Record<SeriesSlug, Screenplay> = {
  /* ------------------------------------------------------------------ */
  sangue: {
    series: "sangue",
    episode: 1,
    title: "O segundo testamento",
    logline:
      "Na noite do velório, Beatriz encontra no cofre do avô um testamento que o irmão jurou não existir.",
    setting: "Palácio Sequeira, Sintra. Noite de chuva. Escritório dourado com cofre na parede.",
    visualBible:
      "Premium Portuguese TV drama, cinematic vertical 9:16 framing, warm tungsten chandelier light against deep crimson walls and gilded frames, rain streaking tall windows, shallow depth of field, slow handheld push-ins, rich shadows, film grain, naturalistic acting.",
    cast: [
      {
        name: "Beatriz Sequeira",
        age: 32,
        look: "woman in her early thirties, dark brown hair in a loose low updo with strands framing her face, brown eyes, burgundy satin slip dress, diamond drop earrings and a thin diamond necklace",
        role: "neta preferida do patriarca",
      },
      {
        name: "Rodrigo Sequeira",
        age: 36,
        look: "man in his mid-thirties, short dark hair, dark stubble, sharp jaw, black suit with black open-collar shirt, whisky glass in hand",
        role: "irmão de Beatriz",
      },
      {
        name: "Dr. Nuno Alves",
        age: 63,
        look: "man in his sixties, grey swept-back hair, round tortoiseshell glasses, charcoal three-piece suit, worn leather folder",
        role: "notário da família",
      },
    ],
    beats: [
      {
        dur: 8,
        shot: "Wide to medium: Beatriz alone in the gilded study at night, chandelier glow, rain on the tall windows. She reaches up and touches the frame of a large oil portrait of an old man.",
        lines: [
          { who: "Beatriz", text: "Prometeste que nunca me deixavas sem resposta, avô.", tone: "soft whisper, grief" },
        ],
        sfx: "rain on glass, distant thunder, clock ticking",
      },
      {
        dur: 7,
        shot: "Close on her hand: the portrait swings slightly ajar, revealing a brass wall safe behind it. She hesitates, then turns the dial.",
        lines: [{ who: "Beatriz", text: "Vinte e três... zero sete...", tone: "whispered, counting under her breath" }],
        sfx: "metal clicks of the dial",
      },
      {
        dur: 7,
        shot: "The safe opens. Inside, an aged envelope with a red wax seal. Extreme close-up of her fingers breaking the seal and unfolding the parchment.",
        lines: [
          {
            who: "Beatriz",
            text: "«Eu, Augusto Sequeira, no pleno uso das minhas faculdades... revogo o testamento anterior.»",
            tone: "reading aloud, voice trembling",
          },
        ],
        sfx: "paper crackle, wax cracking",
      },
      {
        dur: 7,
        shot: "Cut to the double doors: Rodrigo leans on the frame, whisky glass in hand, watching her back. He speaks calmly; she freezes.",
        lines: [{ who: "Rodrigo", text: "A esta hora, mana? Ainda a remexer nas coisas do avô?", tone: "calm, slightly mocking" }],
      },
      {
        dur: 7,
        shot: "Beatriz slides the document behind her back and turns. Rodrigo walks slowly toward her; the camera pushes in with him.",
        lines: [
          { who: "Beatriz", text: "Estava só a despedir-me.", tone: "controlled" },
          { who: "Rodrigo", text: "O notário lê o testamento amanhã às dez. Está tudo tratado.", tone: "smooth" },
        ],
      },
      {
        dur: 7,
        shot: "Tight two-shot, faces lit by the chandelier. Rodrigo's eyes drift to the open safe behind her. A long silence.",
        lines: [{ who: "Beatriz", text: "Tratado por quem, Rodrigo?", tone: "quiet, sharp" }],
        sfx: "clock ticking louder",
      },
      {
        dur: 7,
        shot: "Rodrigo sets the glass down on the desk without breaking eye contact. Her hand tightens on the paper behind her back.",
        lines: [
          { who: "Rodrigo", text: "Tu sempre foste a preferida dele. Mas preferida não é herdeira.", tone: "cold, patronising" },
        ],
      },
      {
        dur: 7,
        shot: "Beatriz brings the document forward and raises it between them. Close on Rodrigo: the smile drains from his face.",
        lines: [{ who: "Beatriz", text: "O avô deixou-me tudo. E tu sabias.", tone: "steady, low" }],
      },
      {
        dur: 7,
        shot: "Rodrigo steps forward; Beatriz steps back until her shoulders touch the open safe. His voice drops.",
        lines: [{ who: "Rodrigo", text: "Esse papel não existe. Nunca existiu.", tone: "menacing whisper" }],
        sfx: "thunder closer",
      },
      {
        dur: 7,
        shot: "The study doors open behind Rodrigo. Dr. Nuno Alves, the notary, stands in the doorway with a leather folder, rain on his shoulders. Both siblings turn.",
        lines: [
          { who: "Dr. Nuno Alves", text: "Peço desculpa pela hora. Mas há uma coisa que ambos precisam de saber... antes de amanhã.", tone: "grave, formal" },
        ],
      },
      {
        dur: 7,
        shot: "Slow push-in on the notary as he lifts a THIRD envelope with the same red seal. Cut between Beatriz and Rodrigo, stunned. Hard cut to black on the last word.",
        lines: [
          { who: "Dr. Nuno Alves", text: "O vosso avô assinou três testamentos. E o último... não beneficia nenhum dos dois.", tone: "measured, devastating" },
        ],
        sfx: "single low orchestral sting, then silence",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  patroa: {
    series: "patroa",
    episode: 1,
    title: "O novo motorista",
    logline:
      "A CEO mais temida de Lisboa contrata um motorista que veio destruí-la. Ela já sabe quem ele é.",
    setting: "Lisboa à noite: garagem da sede do Grupo Vasconcelos, Mercedes preto, marginal do Tejo.",
    visualBible:
      "Sleek corporate noir, cinematic vertical 9:16, cold steel and glass with warm amber city lights of Lisbon (castle on the hill, river), reflections on black car paint, rear-view-mirror compositions, shallow depth of field, controlled slow camera moves, restrained performances.",
    cast: [
      {
        name: "Helena Vasconcelos",
        age: 41,
        look: "woman in her early forties, long dark wavy hair, strong brows, black tailored suit over a low black top, thin gold necklace and gold bracelet, composed and intimidating",
        role: "CEO do Grupo Vasconcelos",
      },
      {
        name: "Tiago Ferreira",
        age: 30,
        look: "man of thirty, dark curly hair, clean-shaven, strong jaw, black suit with black shirt and black tie, tense eyes",
        role: "novo motorista",
      },
    ],
    beats: [
      {
        dur: 8,
        shot: "Night, rooftop garage of a glass HQ overlooking Lisbon. Tiago waits by a black sedan adjusting his tie in the window reflection. His phone buzzes: a message reading 'Ela chega em 2 min. Não falhes.' He deletes it and pockets the phone.",
        lines: [],
        sfx: "distant traffic, wind, elevator chime",
      },
      {
        dur: 7,
        shot: "Helena strides out of the elevator, heels echoing, an assistant trailing. She passes Tiago without looking at him as he opens the rear door.",
        lines: [
          { who: "Helena", text: "Tu és o novo. O outro durou três semanas. Vamos ver quanto duras tu.", tone: "dry, not looking at him" },
        ],
      },
      {
        dur: 7,
        shot: "Inside the car, rear-view-mirror framing: Helena on the phone in the back seat, city lights sliding across her face. Tiago's eyes in the mirror.",
        lines: [
          { who: "Helena", text: "Não me interessa quanto custa. Compra a empresa e despede o filho do dono. Hoje.", tone: "cold, final" },
        ],
      },
      {
        dur: 7,
        shot: "She hangs up and catches him watching in the mirror. He looks back at the road.",
        lines: [
          { who: "Helena", text: "Tens algum problema, motorista?", tone: "flat" },
          { who: "Tiago", text: "Nenhum, Doutora Vasconcelos. Só a estrada.", tone: "polite, guarded" },
        ],
      },
      {
        dur: 7,
        shot: "Driving along the river, bridge lights in the background. Helena scrolls a tablet, then looks up.",
        lines: [
          { who: "Helena", text: "Como te chamas?", tone: "casual" },
          { who: "Tiago", text: "Tiago.", tone: "short" },
          { who: "Helena", text: "Tiago quê?", tone: "probing" },
          { who: "Tiago", text: "Ferreira.", tone: "after a pause a beat too long" },
        ],
      },
      {
        dur: 7,
        shot: "Helena lowers the tablet and studies the back of his head. His knuckles whiten on the wheel.",
        lines: [
          { who: "Helena", text: "Ferreira... Conheci um Ferreira há dez anos. Trabalhava na fábrica de Setúbal.", tone: "slow, testing" },
        ],
      },
      {
        dur: 7,
        shot: "Two-shot through the mirror. Tiago keeps his voice level; Helena leans back with a half-smile as light sweeps her face.",
        lines: [
          { who: "Tiago", text: "Há muitos Ferreiras em Portugal, Doutora.", tone: "controlled" },
          { who: "Helena", text: "Há. Mas poucos com esses olhos.", tone: "quiet, knowing" },
        ],
      },
      {
        dur: 7,
        shot: "Driveway of a riverside mansion. Tiago opens her door. Helena stops very close to him under the porch light.",
        lines: [
          { who: "Helena", text: "Amanhã às sete. E Tiago... eu descubro sempre tudo.", tone: "soft threat" },
        ],
      },
      {
        dur: 7,
        shot: "She walks inside. Tiago alone by the car exhales, then pulls a second, older phone from the door pocket and makes a call, turned away from the house.",
        lines: [{ who: "Tiago", text: "Estou dentro. Ela não desconfia.", tone: "whispered" }],
        sfx: "river wind, distant boat horn",
      },
      {
        dur: 7,
        shot: "Reverse angle from inside the mansion: Helena at the window watching him, holding her phone showing an old photo of a teenage Tiago beside a man in factory overalls. Hard cut to black.",
        lines: [{ who: "Helena", text: "Bem-vindo de volta, filho do Ferreira.", tone: "to herself, almost tender, chilling" }],
        sfx: "low sting, silence",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  traicao: {
    series: "traicao",
    episode: 1,
    title: "A chamada às 3 da manhã",
    logline: "Marta atende o telemóvel do marido a meio da noite. A voz do outro lado sabe o que está no carro dele.",
    setting: "Quarto principal de uma quinta em Sintra, luar, palácio iluminado ao fundo. Pátio de gravilha.",
    visualBible:
      "Moody nocturnal thriller, cinematic vertical 9:16, cold moonlight blue against a single warm bedside lamp, phone-screen glow on skin, Sintra palace lights on the hill through the window, very shallow focus, slow creeping camera, long silences.",
    cast: [
      {
        name: "Marta Cunha",
        age: 38,
        look: "woman in her late thirties, long brown hair, black silk robe over a lace slip, engagement ring, dark red nails",
        role: "mulher de Paulo",
      },
      {
        name: "Paulo Cunha",
        age: 42,
        look: "man in his early forties, short dark hair, trimmed beard, asleep in a white t-shirt",
        role: "marido",
      },
    ],
    beats: [
      {
        dur: 8,
        shot: "Night bedroom in moonlight; Paulo asleep. On his nightstand a phone screen lights up reading 'Número desconhecido' and vibrates. Marta stirs and opens her eyes.",
        lines: [],
        sfx: "phone vibrating on wood, wind outside",
      },
      {
        dur: 7,
        shot: "Close on the clock: 03:04. Marta looks at Paulo, then at the phone. She hesitates, then answers in a whisper.",
        lines: [{ who: "Marta", text: "Estou sim?", tone: "whisper" }],
      },
      {
        dur: 7,
        shot: "Extreme close-up on Marta's face lit by the screen. A calm female voice on the line. Her expression freezes.",
        lines: [
          { who: "Voz (mulher)", text: "Marta. Finalmente.", tone: "calm, intimate, phone voice" },
          { who: "Marta", text: "Quem fala?", tone: "whisper, alarmed" },
          { who: "Voz (mulher)", text: "Alguém que sabe onde o teu marido esteve na terça-feira.", tone: "phone voice, unhurried" },
        ],
      },
      {
        dur: 7,
        shot: "Marta gets up and moves to the window; the palace lights glow on the hill. She keeps her voice low.",
        lines: [
          { who: "Marta", text: "Se isto é uma partida...", tone: "low, shaking" },
          { who: "Voz (mulher)", text: "Vai ao carro dele. Porta-luvas. Agora, enquanto ele dorme.", tone: "phone voice, commanding" },
        ],
      },
      {
        dur: 7,
        shot: "She looks back at sleeping Paulo, breathes, and silently lifts his car keys from the dresser.",
        lines: [],
        sfx: "keys barely clinking, floorboard creak",
      },
      {
        dur: 7,
        shot: "Exterior gravel courtyard, cold blue. She opens the car and the glovebox: inside, a second phone and a hotel key card printed 'Hotel Palácio · 214'.",
        lines: [],
        sfx: "gravel, car door, glovebox click",
      },
      {
        dur: 7,
        shot: "The second phone lights up by itself with a text: 'Ela já está a ver? 🙂'. Marta drops it on the seat.",
        lines: [{ who: "Marta", text: "Meu Deus...", tone: "breathless" }],
      },
      {
        dur: 7,
        shot: "Close on her own phone still on the call. The voice returns. Marta slowly turns toward the house.",
        lines: [{ who: "Voz (mulher)", text: "Ainda estás aí, Marta? Vira-te.", tone: "phone voice, amused" }],
      },
      {
        dur: 7,
        shot: "Low angle up to the bedroom window: the light is now on. Paulo's silhouette stands at the window with a phone to his ear, watching her.",
        lines: [{ who: "Voz (mulher)", text: "Ele acordou.", tone: "phone voice, flat" }],
        sfx: "wind rising",
      },
      {
        dur: 7,
        shot: "Tight on Marta's face as the call ends with a beep. Then her own phone rings in her robe pocket; the screen reads 'Paulo ❤️'. Hard cut to black.",
        lines: [],
        sfx: "call-ended beep, ringtone, cut to silence",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  regresso: {
    series: "regresso",
    episode: 1,
    title: "Quinze anos depois",
    logline: "Um homem visita a própria campa numa aldeia transmontana. A mãe enterrou-o em 2011.",
    setting: "Aldeia de granito em Trás-os-Montes, nevoeiro ao amanhecer. Cemitério, café, cozinha de pedra.",
    visualBible:
      "Rural Portuguese mystery, cinematic vertical 9:16, dawn fog over granite houses and slate roofs, desaturated cold greens and greys with a single warm kitchen light, static contemplative frames, long lenses, weathered faces.",
    cast: [
      {
        name: "Duarte Meireles",
        age: 45,
        look: "man in his mid-forties, weathered face, grey at the temples, thin scar through his left eyebrow, dark wool coat, one canvas bag",
        role: "o homem que voltou",
      },
      {
        name: "Lurdes Meireles",
        age: 70,
        look: "woman of seventy, white hair in a bun, black cardigan and black skirt, rosary around her wrist",
        role: "mãe",
      },
      {
        name: "Inspetor Vieira",
        age: 55,
        look: "man in his fifties, grey moustache, dark green GNR uniform jacket, cap in hand",
        role: "autoridade da aldeia",
      },
    ],
    beats: [
      {
        dur: 8,
        shot: "Dawn, thick fog over a granite village. A regional bus stops on the empty road; a man steps down with one bag and watches it leave.",
        lines: [],
        sfx: "bus engine fading, church bell, crows",
      },
      {
        dur: 7,
        shot: "Cemetery gate. He walks between graves and stops at a headstone reading 'DUARTE MEIRELES 1981 – 2011'. He touches the letters of his own name.",
        lines: [{ who: "Duarte", text: "Mentiram bem.", tone: "murmur, bitter" }],
      },
      {
        dur: 7,
        shot: "Village café. Old men at a table stop talking as he enters. The owner behind the counter goes pale, hands trembling on a cup.",
        lines: [
          { who: "Duarte", text: "Um café, por favor.", tone: "quiet" },
          { who: "Dono do café", text: "Não pode ser...", tone: "whisper, terrified" },
        ],
      },
      {
        dur: 7,
        shot: "Stone kitchen, warm light. Lurdes stirs a pot at the stove. The door creaks; she turns and sees him. A very long silence.",
        lines: [{ who: "Lurdes", text: "Enterrei-te. Enterrei-te com as minhas mãos.", tone: "barely audible, shaking" }],
      },
      {
        dur: 7,
        shot: "Duarte steps closer. She slaps him hard, then grabs his face with both hands, crying.",
        lines: [{ who: "Duarte", text: "Enterrou o que lhe disseram para enterrar, mãe.", tone: "gentle, firm" }],
      },
      {
        dur: 7,
        shot: "Close two-shot at the kitchen table, her hands still holding his.",
        lines: [
          { who: "Lurdes", text: "Onde estiveste? Quinze anos, Duarte. Quinze!", tone: "anguished" },
          { who: "Duarte", text: "Num sítio onde ninguém me podia encontrar. E precisava que assim fosse.", tone: "low" },
        ],
      },
      {
        dur: 7,
        shot: "Her thumb traces the scar on his eyebrow.",
        lines: [
          { who: "Lurdes", text: "Quem te fez isso?", tone: "whisper" },
          { who: "Duarte", text: "As mesmas pessoas que mandaram fazer o funeral.", tone: "cold" },
        ],
      },
      {
        dur: 7,
        shot: "A knock. Inspetor Vieira stands at the open door, cap in hand, fog behind him. His eyes lock on Duarte.",
        lines: [{ who: "Inspetor Vieira", text: "Dona Lurdes... disseram-me que tinha visitas.", tone: "careful" }],
      },
      {
        dur: 7,
        shot: "The two men face each other across the kitchen; Lurdes between them.",
        lines: [
          { who: "Inspetor Vieira", text: "Há quinze anos assinei a tua certidão de óbito, rapaz.", tone: "heavy" },
          { who: "Duarte", text: "Eu sei. Foi por isso que voltei.", tone: "steady" },
        ],
      },
      {
        dur: 7,
        shot: "Vieira lowers his voice. Duarte answers, then looks up at the ceiling as a floorboard creaks upstairs. Lurdes closes her eyes. Hard cut to black.",
        lines: [
          { who: "Inspetor Vieira", text: "Então também sabes que não fui eu que te quis morto.", tone: "quiet" },
          { who: "Duarte", text: "Não. Foi o meu irmão. E ele ainda vive nesta casa.", tone: "flat, chilling" },
        ],
        sfx: "floorboard creak upstairs, silence",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  verao: {
    series: "verao",
    episode: 1,
    title: "A última noite de agosto",
    logline: "Inês tem onze horas até ao comboio. Miguel quer que fique. O noivo dela é irmão dele.",
    setting: "Algarve, falésias douradas ao pôr do sol; bar de praia com luzes penduradas ao anoitecer.",
    visualBible:
      "Sun-drenched Portuguese summer romance turning tense, cinematic vertical 9:16, golden hour on ochre cliffs and turquoise sea, then blue dusk with warm string lights, sea spray, skin glow, handheld intimacy, natural sound of waves.",
    cast: [
      {
        name: "Inês Ribeiro",
        age: 26,
        look: "woman of twenty-six, sun-kissed skin, wavy chestnut hair, white linen dress, barefoot, delicate gold ring on her left hand",
        role: "a rapariga de Lisboa",
      },
      {
        name: "Miguel Santos",
        age: 28,
        look: "man of twenty-eight, tanned surfer, tousled sun-bleached brown hair, open light-blue linen shirt, shell necklace",
        role: "o surfista",
      },
      {
        name: "Carla",
        age: 26,
        look: "woman of twenty-six, short dark curly hair, yellow sundress, phone always in hand",
        role: "melhor amiga de Inês",
      },
    ],
    beats: [
      {
        dur: 8,
        shot: "Golden hour on a cliff beach. Inês writes 'ÚLTIMO DIA' in the wet sand with a finger; a wave erases it. Miguel jogs up holding two melting ice creams.",
        lines: [{ who: "Miguel", text: "Fugiste-me outra vez.", tone: "playful, out of breath" }],
        sfx: "waves, gulls",
      },
      {
        dur: 7,
        shot: "They sit on the sand facing the orange sea, shoulders almost touching.",
        lines: [
          { who: "Inês", text: "Amanhã às oito estou no comboio para Lisboa.", tone: "matter-of-fact, sad" },
          { who: "Miguel", text: "Então ainda temos onze horas.", tone: "light, hopeful" },
        ],
      },
      {
        dur: 7,
        shot: "Close two-shot. She doesn't look at him; ice cream drips over his fingers.",
        lines: [
          { who: "Inês", text: "Não faças isso.", tone: "quiet" },
          { who: "Miguel", text: "O quê?", tone: "soft" },
          { who: "Inês", text: "Fazeres parecer fácil.", tone: "cracking" },
        ],
      },
      {
        dur: 7,
        shot: "Dusk, beach bar with string lights. They dance barefoot on the wooden deck, slow.",
        lines: [
          { who: "Miguel", text: "Fica mais uma semana.", tone: "murmured into her hair" },
          { who: "Inês", text: "Tenho um noivo, Miguel.", tone: "whispered confession" },
        ],
        sfx: "soft acoustic guitar from the bar speakers, sea",
      },
      {
        dur: 7,
        shot: "He stops dancing and steps back half a step, still holding her hand.",
        lines: [
          { who: "Miguel", text: "Tens um quê?", tone: "stunned" },
          { who: "Inês", text: "Devia ter dito. No primeiro dia.", tone: "ashamed" },
          { who: "Miguel", text: "Pois devias.", tone: "hurt, quiet" },
        ],
      },
      {
        dur: 7,
        shot: "He walks toward the dark water; she follows across the sand.",
        lines: [
          { who: "Inês", text: "O casamento é em setembro. Está tudo marcado. Tudo pago.", tone: "pleading" },
          { who: "Miguel", text: "E és feliz?", tone: "not turning around" },
        ],
      },
      {
        dur: 7,
        shot: "Carla runs down the boardwalk, phone in hand, pale, grabbing Inês by the arm.",
        lines: [{ who: "Carla", text: "Inês... o Ricardo. Está aqui. Está no parque de estacionamento.", tone: "urgent whisper" }],
      },
      {
        dur: 7,
        shot: "Inês freezes. Miguel turns. Carla looks between them, realising.",
        lines: [
          { who: "Miguel", text: "Ricardo é o noivo?", tone: "slow" },
          { who: "Carla", text: "É. E o Ricardo é o teu irmão, Miguel.", tone: "horrified" },
        ],
      },
      {
        dur: 7,
        shot: "Miguel stares at Inês, betrayed. Headlights sweep across the beach from the parking lot; a car door slams.",
        lines: [{ who: "Inês", text: "Eu não sabia. Juro que não sabia.", tone: "desperate" }],
        sfx: "car door slam, engine off",
      },
      {
        dur: 7,
        shot: "A man's silhouette walks down the boardwalk against the headlights. Miguel steps in front of Inês. A voice calls out. Hard cut on Inês's face.",
        lines: [{ who: "Ricardo (fora de campo)", text: "Inês? ... Miguel?!", tone: "calling out, confused then angry" }],
        sfx: "waves, cut to silence",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  divida: {
    series: "divida",
    episode: 1,
    title: "O envelope sem remetente",
    logline: "Ao jantar chega uma fotografia e um prazo de 48 horas. Alguém à mesa é o chantagista.",
    setting: "Casa senhorial no Porto. Sala de jantar com relógio antigo, velas, mesa comprida. Casa de banho de mármore.",
    visualBible:
      "Elegant family suspense, cinematic vertical 9:16, candlelit dinner with gold and deep green tones, ornate antique clock looming in the background, symmetrical framings broken by nervous handheld close-ups, ticking clock as heartbeat.",
    cast: [
      {
        name: "Teresa Amaral",
        age: 44,
        look: "woman in her mid-forties, dark hair in an elegant updo, emerald green silk dress, pearl earrings and bracelet",
        role: "matriarca em risco",
      },
      {
        name: "Joaquim Amaral",
        age: 58,
        look: "man in his late fifties, grey beard, dark suit and tie, calm heavy presence",
        role: "marido",
      },
      {
        name: "Vasco Amaral",
        age: 24,
        look: "young man of twenty-four, dark hair, open-collar white shirt under a navy blazer",
        role: "filho",
      },
      {
        name: "Dona Isabel",
        age: 68,
        look: "woman of sixty-eight, silver hair pinned back, cream blouse, gold brooch, watchful eyes",
        role: "sogra",
      },
    ],
    beats: [
      {
        dur: 8,
        shot: "Long candlelit dinner table; the antique clock behind reads nine. A maid brings an envelope on a silver tray to Teresa.",
        lines: [{ who: "Empregada", text: "Chegou agora, Dona Teresa. Sem remetente.", tone: "discreet" }],
        sfx: "cutlery, clock ticking",
      },
      {
        dur: 7,
        shot: "Teresa opens it: a photograph of a man and a woman embracing in a hotel corridor. Her face drains of colour.",
        lines: [
          { who: "Joaquim", text: "Que é isso?", tone: "casual" },
          { who: "Teresa", text: "Nada. Publicidade.", tone: "too fast" },
        ],
      },
      {
        dur: 7,
        shot: "Under the table she turns the photo over: handwritten '48 HORAS. 500 MIL. OU ELES VEEM TUDO.' Vasco notices her hands shaking.",
        lines: [],
        sfx: "paper, clock",
      },
      {
        dur: 7,
        shot: "Dona Isabel studies her from across the table. Joaquim keeps cutting his steak, unbothered.",
        lines: [
          { who: "Dona Isabel", text: "Teresa, estás branca como a cal.", tone: "sweetly probing" },
          { who: "Teresa", text: "É o calor.", tone: "forced smile" },
        ],
      },
      {
        dur: 7,
        shot: "Marble bathroom. Teresa locks the door and looks at the photo again: the woman is her; the man is not her husband. She dials a number.",
        lines: [{ who: "Teresa", text: "Recebi. Quem te deu isto?", tone: "hissed whisper" }],
      },
      {
        dur: 7,
        shot: "Extreme close-up as a distorted male voice answers. Her eyes go to the locked door.",
        lines: [
          { who: "Voz (homem)", text: "Não sou eu que a tenho, Teresa. Alguém em tua casa é que tem.", tone: "distorted phone voice, calm" },
        ],
      },
      {
        dur: 7,
        shot: "Back at the table. Everyone looks up as she sits. The clock ticks.",
        lines: [
          { who: "Vasco", text: "Mãe, está tudo bem?", tone: "worried" },
          { who: "Teresa", text: "Está.", tone: "brittle" },
        ],
      },
      {
        dur: 7,
        shot: "Joaquim raises his glass and looks straight at her for a long beat.",
        lines: [{ who: "Joaquim", text: "Um brinde. À família. Que não tem segredos.", tone: "slow, ambiguous" }],
        sfx: "glasses clinking",
      },
      {
        dur: 7,
        shot: "Dona Isabel reaches over and places her hand on Teresa's, leaning in.",
        lines: [{ who: "Dona Isabel", text: "Eu sei quem tirou a fotografia, minha querida.", tone: "whisper, tender" }],
      },
      {
        dur: 7,
        shot: "Teresa turns to her, breathless. Dona Isabel holds her gaze. The clock strikes. Hard cut to black.",
        lines: [{ who: "Dona Isabel", text: "Fui eu.", tone: "calm, devastating" }],
        sfx: "clock chime, silence",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  fogo: {
    series: "fogo",
    episode: 1,
    title: "O informador",
    logline: "Sofia resgata um informador. Só duas pessoas sabiam a hora e o sítio — e uma é o seu parceiro.",
    setting: "Lisboa, Marvila, armazém abandonado à noite. Luzes azuis de polícia pelas janelas partidas.",
    visualBible:
      "Gritty Portuguese police thriller, cinematic vertical 9:16, dusty flashlight beams cutting through darkness, strobing blue police light through broken windows, handheld urgency, desaturated teal and rust, realistic tactical detail.",
    cast: [
      {
        name: "Inspetora Sofia Rocha",
        age: 34,
        look: "woman of thirty-four, dark hair tied back tight, black tactical vest marked 'PJ' over a grey shirt, holstered pistol, flashlight",
        role: "inspetora da Polícia Judiciária",
      },
      {
        name: "Inspetor Rui Baptista",
        age: 40,
        look: "man of forty, shaved head, dark stubble, black tactical vest marked 'PJ', pistol in hand",
        role: "parceiro de Sofia",
      },
      {
        name: "Leandro",
        age: 35,
        look: "man of thirty-five, bruised face, split lip, grey tracksuit, gold chain, tied to a metal chair",
        role: "informador",
      },
    ],
    beats: [
      {
        dur: 8,
        shot: "Night. Sofia and Rui advance into an abandoned warehouse, weapons drawn, flashlight beams cutting through dust. Radio crackles.",
        lines: [{ who: "Sofia", text: "Rui, esquerda. Eu vou pela direita.", tone: "whispered command" }],
        sfx: "radio static, dripping water, distant sirens",
      },
      {
        dur: 7,
        shot: "Her beam finds Leandro tied to a metal chair, beaten but alive. She lowers her weapon and rushes to him.",
        lines: [
          { who: "Sofia", text: "Leandro! Quem te fez isto?", tone: "urgent" },
          { who: "Leandro", text: "Vieram buscar o telemóvel, inspetora.", tone: "spitting blood, hoarse" },
        ],
      },
      {
        dur: 7,
        shot: "She cuts the zip ties with a knife. He grabs her forearm hard.",
        lines: [{ who: "Leandro", text: "Eles sabiam que eu ia falar. Sabiam a hora. Sabiam o sítio.", tone: "desperate whisper" }],
      },
      {
        dur: 7,
        shot: "Sofia's face changes. She looks up: Rui stands in the doorway, gun at his side, silhouetted against strobing blue light.",
        lines: [{ who: "Sofia", text: "Só duas pessoas sabiam a hora e o sítio.", tone: "to herself, realising" }],
      },
      {
        dur: 7,
        shot: "Rui calls out from the doorway. Leandro leans to Sofia's ear.",
        lines: [
          { who: "Rui", text: "Está limpo lá fora. Vamos embora.", tone: "normal, brisk" },
          { who: "Leandro", text: "Foi ele. Foi ele que me ligou.", tone: "whisper" },
        ],
      },
      {
        dur: 7,
        shot: "Sofia stands slowly, hand drifting toward her holster, flashlight still on Rui.",
        lines: [
          { who: "Sofia", text: "Rui... a que horas chegaste aqui?", tone: "carefully neutral" },
          { who: "Rui", text: "Contigo. Porquê?", tone: "puzzled" },
        ],
      },
      {
        dur: 7,
        shot: "Rui walks closer; her beam crosses his face. He stops three metres away.",
        lines: [
          { who: "Rui", text: "O que é que ele te disse, Sofia?", tone: "low" },
          { who: "Sofia", text: "Que alguém o traiu.", tone: "steady" },
        ],
      },
      {
        dur: 7,
        shot: "Long standoff between the two partners in the blue strobe. Neither raises a weapon.",
        lines: [
          { who: "Rui", text: "E acreditas num traficante ou em mim?", tone: "wounded, tense" },
          { who: "Sofia", text: "Ainda não decidi.", tone: "cold" },
        ],
      },
      {
        dur: 7,
        shot: "Leandro screams a warning. A red laser dot appears on Sofia's vest from a high broken window. Rui lunges and shoves her aside as a shot cracks and glass explodes.",
        lines: [{ who: "Leandro", text: "Cuidado!", tone: "scream" }],
        sfx: "gunshot, glass shattering, ringing ears",
      },
      {
        dur: 7,
        shot: "Rui on the concrete floor, shoulder bleeding. Sofia kneels over him, pressing the wound. He grabs her vest. Hard cut to black on the last word.",
        lines: [{ who: "Rui", text: "Não fui eu... mas sei quem foi. E tu não vais gostar.", tone: "gasping" }],
        sfx: "sirens approaching, cut to silence",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  promessa: {
    series: "promessa",
    episode: 1,
    title: "Lisboa, 1943",
    logline: "Num café do Rossio, o preço de uma lista de refugiados é um pedido de casamento. Amélia já prometeu casar com outro.",
    setting: "Lisboa, 1943. Café no Rossio com elétricos a passar; salão e quarto de uma casa senhorial na Lapa.",
    visualBible:
      "1940s period drama, cinematic vertical 9:16, warm sepia-leaning palette with deep shadows, period-accurate costumes (pinned hair, tailored dresses, hats, brown suits), trams and black cars through café windows, smoke and lamplight, restrained classical framing.",
    cast: [
      {
        name: "Amélia Castelo",
        age: 24,
        look: "woman of twenty-four, dark hair pinned in 1940s victory rolls, blue tailored dress with padded shoulders, small pearl earrings, gloves in her lap",
        role: "filha do Coronel",
      },
      {
        name: "Frederico Lima",
        age: 28,
        look: "man of twenty-eight, brown wool suit, loosened tie, fedora on the table, ink-stained fingers, tired intelligent eyes",
        role: "jornalista",
      },
      {
        name: "Coronel Castelo",
        age: 60,
        look: "man of sixty, grey moustache, olive military dress uniform with medals, rigid posture",
        role: "pai de Amélia",
      },
      {
        name: "Herr Weber",
        age: 45,
        look: "man of forty-five, blond slicked hair, grey double-breasted suit, monocle-free but precise, thin smile",
        role: "diplomata alemão",
      },
    ],
    beats: [
      {
        dur: 8,
        shot: "Lisbon 1943, Rossio café: trams pass the window, black cars, men in hats. Amélia waits with a coffee and checks a small pocket watch. Frederico sits down opposite her.",
        lines: [
          { who: "Frederico", text: "Chegaste cedo.", tone: "wry" },
          { who: "Amélia", text: "Tu é que chegaste tarde. Como sempre.", tone: "dry, fond" },
        ],
        sfx: "tram bell, cups, murmur",
      },
      {
        dur: 7,
        shot: "He slides a folded newspaper across the marble table without looking down.",
        lines: [
          { who: "Frederico", text: "Dentro está o que pediste. Nomes. Datas. O barco.", tone: "low" },
          { who: "Amélia", text: "E o preço?", tone: "guarded" },
        ],
      },
      {
        dur: 7,
        shot: "Close on Frederico. She laughs softly, then sees he is serious.",
        lines: [
          { who: "Frederico", text: "Casa comigo.", tone: "plain, sincere" },
          { who: "Frederico", text: "Sábado. Antes de o teu pai te entregar ao alemão.", tone: "urgent whisper" },
        ],
      },
      {
        dur: 7,
        shot: "Amélia looks out at a passing tram; her gloved hand closes over the newspaper.",
        lines: [
          { who: "Amélia", text: "Prometi ao meu pai.", tone: "quiet" },
          { who: "Frederico", text: "Prometeste ou obedeceste?", tone: "gentle challenge" },
        ],
      },
      {
        dur: 7,
        shot: "Evening, Lapa mansion salon. Coronel Castelo pours brandy for Herr Weber under a crystal chandelier.",
        lines: [{ who: "Coronel Castelo", text: "A minha filha é uma mulher de palavra, Herr Weber.", tone: "proud, formal" }],
        sfx: "crystal, distant piano",
      },
      {
        dur: 7,
        shot: "Amélia enters; Weber rises and kisses her gloved hand.",
        lines: [
          { who: "Herr Weber", text: "A menina Amélia. Sábado será um dia histórico.", tone: "German-accented Portuguese, courteous" },
          { who: "Amélia", text: "Para todos nós.", tone: "polite, double-edged" },
        ],
      },
      {
        dur: 7,
        shot: "Her bedroom, lamplight. She unfolds the newspaper: a typed list of refugee names, one circled in red ink — 'CASTELO, Amélia — 12 de junho, Cais de Alcântara'. Her own name.",
        lines: [],
        sfx: "paper, clock, her breath",
      },
      {
        dur: 7,
        shot: "Footsteps. She hides the paper inside a book. The Coronel stands at the door.",
        lines: [
          { who: "Coronel Castelo", text: "Frederico Lima. Sabes quem é?", tone: "flat" },
          { who: "Amélia", text: "Um jornalista.", tone: "even" },
        ],
      },
      {
        dur: 7,
        shot: "The Coronel steps in and studies her face.",
        lines: [
          { who: "Coronel Castelo", text: "Foi preso há uma hora pela PVDE. Por espionagem.", tone: "measured" },
          { who: "Coronel Castelo", text: "Espero que não tenhas nada a ver com isso.", tone: "warning" },
        ],
      },
      {
        dur: 7,
        shot: "She holds his gaze. He leaves. She opens the book: tucked in the newspaper, a handwritten note in Frederico's hand reading 'Se me prenderem, o barco sai na mesma. Vai sem mim. Prometes?'. She closes her eyes. Hard cut to black.",
        lines: [{ who: "Amélia", text: "Nada, pai.", tone: "steady lie" }],
        sfx: "door closing, silence",
      },
    ],
  },
};

export const PT_ACCENT_NOTE = PT;

export function screenplayDuration(sp: Screenplay): number {
  return sp.beats.reduce((acc, b) => acc + b.dur, 0);
}

export const MAX_EPISODE_SECONDS = 90;
