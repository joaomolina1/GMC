import type { Screenplay } from "./types";

/**
 * Segundos episódios TVI BOX — continuam diretamente o cliffhanger do EP1.
 *
 * Regras (iguais ao EP1): vertical 9:16, 8 s + extensões de 7 s, falas em português
 * europeu, planos em inglês, corte seco no fim. O elenco recorrente mantém o mesmo nome
 * e a descrição visual segue o que ficou efetivamente no render do EP1 (continuidade).
 */
export const SCREENPLAYS_EP2: Screenplay[] = [
  /* ------------------------------------------------------------------ */
  {
    series: "sangue",
    episode: 2,
    title: "O terceiro envelope",
    logline:
      "O notário lê o terceiro testamento do avô: o palácio fica para uma filha que ninguém conhecia — e que vive naquela casa há trinta anos.",
    setting:
      "Palácio Sequeira, Sintra, the same rainy night minutes later: the ornate study with crimson walls, the oil portrait of the old patriarch, the open brass wall safe, a mahogany desk under the chandelier.",
    visualBible:
      "Premium Portuguese TV drama, cinematic vertical 9:16 framing, warm tungsten chandelier light against deep crimson walls and gilded frames, rain streaking tall windows, shallow depth of field, slow handheld push-ins, rich shadows, film grain, naturalistic acting.",
    cast: [
      {
        name: "Beatriz Sequeira",
        age: 32,
        look: "woman in her early thirties, dark brown hair in a low braided updo with strands framing her face, brown eyes, black satin slip dress with thin straps, thin diamond necklace and diamond drop earrings",
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
        look: "man in his sixties, grey swept-back hair, round tortoiseshell glasses, charcoal three-piece suit and dark tie, worn leather folder, rain still on his shoulders",
        role: "notário da família",
      },
      {
        name: "Dona Graça",
        age: 60,
        look: "woman of sixty, grey hair pinned back, black housekeeper's dress with a white collar, small silver crucifix, work-worn hands",
        role: "governanta do palácio há trinta anos",
      },
    ],
    beats: [
      {
        dur: 8,
        shot: "The gilded study minutes later, rain still streaking the windows. Dr. Nuno Alves sits at the mahogany desk and breaks the red wax seal of the third envelope; Beatriz stands to his left, Rodrigo to his right with his whisky glass, both staring at the paper.",
        lines: [
          { who: "Dr. Nuno Alves", text: "Assinado há três semanas, com duas testemunhas. Não há margem para dúvidas.", tone: "grave, formal" },
        ],
        sfx: "rain on glass, clock ticking, paper unfolding",
      },
      {
        dur: 7,
        shot: "Rodrigo reaches for the document; Dr. Nuno Alves pulls it back out of reach without looking up. Beatriz watches her brother.",
        lines: [
          { who: "Rodrigo", text: "O avô já não estava em si. Isso não vale nada.", tone: "dismissive, jaw tight" },
          { who: "Beatriz", text: "Estava lúcido até ao fim. E tu sabes disso.", tone: "sharp" },
        ],
      },
      {
        dur: 7,
        shot: "Dr. Nuno Alves adjusts his glasses and reads aloud. Close on Beatriz, then on Rodrigo, as the words land.",
        lines: [
          { who: "Dr. Nuno Alves", text: "«Deixo o Palácio Sequeira e a totalidade das minhas participações... à minha filha.»", tone: "reading, measured" },
          { who: "Beatriz", text: "Filha? O avô só teve o nosso pai.", tone: "stunned" },
        ],
      },
      {
        dur: 7,
        shot: "Dr. Nuno Alves takes off his glasses and looks at each sibling in turn. Rodrigo lets out a short bitter laugh and drains his glass.",
        lines: [
          { who: "Dr. Nuno Alves", text: "O vosso avô teve uma filha em mil novecentos e setenta e nove, fora do casamento. Nunca a reconheceu. Até agora.", tone: "grave" },
        ],
      },
      {
        dur: 7,
        shot: "Rodrigo sets the empty glass on the desk with a sharp click and leans over Dr. Nuno Alves.",
        lines: [
          { who: "Rodrigo", text: "Uma desconhecida. Que conveniente. Quanto é que ela te pagou, Nuno?", tone: "cold, accusing" },
          { who: "Dr. Nuno Alves", text: "Ela não sabe de nada. Ainda.", tone: "calm" },
        ],
      },
      {
        dur: 7,
        shot: "Beatriz steps closer to the desk, her voice barely above a whisper. Dr. Nuno Alves hesitates and glances at the closed double doors.",
        lines: [
          { who: "Beatriz", text: "Como é que ela se chama?", tone: "quiet" },
          { who: "Dr. Nuno Alves", text: "Eu nunca a vi. Mas ambos a conhecem muito bem.", tone: "slow, careful" },
        ],
      },
      {
        dur: 7,
        shot: "Two-shot of the siblings with the portrait of the old patriarch looming behind them. Rodrigo turns on Beatriz.",
        lines: [
          { who: "Rodrigo", text: "Se isto é um esquema teu...", tone: "menacing" },
          { who: "Beatriz", text: "Eu também estou a ouvir isto pela primeira vez, Rodrigo.", tone: "steady" },
        ],
        sfx: "thunder, rain",
      },
      {
        dur: 7,
        shot: "The double doors open. Dona Graça, the housekeeper, enters carrying a silver tea tray and stops dead as three faces turn to her.",
        lines: [{ who: "Dona Graça", text: "Peço desculpa... ouvi vozes. Trouxe chá.", tone: "soft, uneasy" }],
        sfx: "door creak, porcelain rattling",
      },
      {
        dur: 7,
        shot: "Dr. Nuno Alves rises slowly and pulls out a chair for her. Beatriz looks from the notary to Dona Graça and the colour drains from her face.",
        lines: [
          { who: "Dr. Nuno Alves", text: "Dona Graça. Sente-se, por favor.", tone: "gentle, formal" },
          { who: "Rodrigo", text: "Ela? A empregada?", tone: "incredulous, contemptuous" },
        ],
      },
      {
        dur: 7,
        shot: "Dona Graça sets the tray down with trembling hands and looks up at the portrait of the old man. Cut between Beatriz and Rodrigo, frozen. Hard cut to black on the last word.",
        lines: [{ who: "Dona Graça", text: "Ele prometeu-me que ninguém ia saber. Nunca.", tone: "whisper, breaking" }],
        sfx: "rain, clock stops, silence",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    series: "patroa",
    episode: 2,
    title: "Sete da manhã",
    logline:
      "Helena leva Tiago à fábrica de Setúbal onde o pai dele morreu — e entrega-lhe o relatório verdadeiro do acidente.",
    setting:
      "Setúbal, Portugal, seven in the morning: the rusted gates and vast empty floor of an abandoned canning factory, broken skylights, grey morning fog, a black luxury sedan parked outside.",
    visualBible:
      "Sleek corporate noir taken into daylight ruin, cinematic vertical 9:16, cold grey dawn light through broken skylights, dust in the air, rust and peeling paint against immaculate black tailoring, shallow depth of field, slow controlled camera moves, restrained performances.",
    cast: [
      {
        name: "Helena Vasconcelos",
        age: 41,
        look: "woman in her early forties, long dark wavy hair, strong brows, black tailored suit over a low black top under a long black wool coat, thin gold necklace and gold bracelet, composed and intimidating",
        role: "CEO do Grupo Vasconcelos",
      },
      {
        name: "Tiago Ferreira",
        age: 30,
        look: "man of thirty, dark curly hair, clean-shaven, strong jaw, black suit with black shirt and black tie, tense eyes",
        role: "motorista — filho do chefe de turno que morreu na fábrica",
      },
    ],
    beats: [
      {
        dur: 8,
        shot: "Grey dawn. The black sedan rolls to a stop at the rusted gates of an abandoned factory in fog. Tiago at the wheel, jaw tight; in the rear-view mirror Helena watches him.",
        lines: [{ who: "Helena", text: "Sabes onde estamos, Tiago?", tone: "quiet, testing" }],
        sfx: "engine idling, gulls, wind through metal",
      },
      {
        dur: 7,
        shot: "Tiago keeps his eyes on the gates. Helena opens her own door before he can move.",
        lines: [
          { who: "Tiago", text: "Uma fábrica abandonada, Doutora.", tone: "flat" },
          { who: "Helena", text: "Sai do carro.", tone: "command" },
        ],
      },
      {
        dur: 7,
        shot: "Wide: the two walk across the vast empty factory floor, broken skylights above, pigeons scattering. Helena's heels echo on the concrete.",
        lines: [
          { who: "Helena", text: "Há dez anos trabalhavam aqui trezentas pessoas. O teu pai era o chefe de turno.", tone: "matter-of-fact" },
        ],
        sfx: "heels echoing, pigeons, dripping water",
      },
      {
        dur: 7,
        shot: "Tiago stops walking. Helena keeps going a few steps, then turns to face him.",
        lines: [
          { who: "Tiago", text: "Não sei de que está a falar.", tone: "tight" },
          { who: "Helena", text: "Sabes. Sabes desde que te sentaste ao volante.", tone: "calm" },
        ],
      },
      {
        dur: 7,
        shot: "Helena stops beneath a rusted overhead gantry and looks down at a patch of stained concrete.",
        lines: [{ who: "Helena", text: "Foi aqui. Caiu daquela plataforma. Disseram que foi um acidente.", tone: "low" }],
      },
      {
        dur: 7,
        shot: "Close on Tiago: eyes wet, fists clenched, voice cracking with anger.",
        lines: [
          { who: "Tiago", text: "Foi a senhora que mandou fechar a fábrica. Três dias depois de o enterrarem.", tone: "breaking, furious" },
        ],
      },
      {
        dur: 7,
        shot: "Helena walks right up to him, face to face, unflinching.",
        lines: [{ who: "Helena", text: "Fechei. E vou dizer-te porquê — se conseguires ouvir até ao fim.", tone: "steady" }],
      },
      {
        dur: 7,
        shot: "Tight two-shot. Tiago's voice drops to a threat; Helena does not blink.",
        lines: [
          { who: "Tiago", text: "Eu vim para acabar consigo, Doutora.", tone: "low threat" },
          { who: "Helena", text: "Eu sei. Foi por isso que te contratei.", tone: "almost gentle" },
        ],
      },
      {
        dur: 7,
        shot: "Helena takes a folded, yellowed document from her coat and presses it into his hands. He unfolds it; his hands shake.",
        lines: [{ who: "Helena", text: "O relatório do acidente. O verdadeiro. O teu pai não caiu.", tone: "quiet" }],
        sfx: "paper unfolding, wind",
      },
      {
        dur: 7,
        shot: "Headlights sweep through the fog at the factory gates behind them; Helena turns toward the light while Tiago still stares at the paper. Hard cut to black on the last word.",
        lines: [{ who: "Helena", text: "Empurraram-no. E quem o fez acabou de chegar.", tone: "cold" }],
        sfx: "car engine approaching, gulls, silence",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    series: "traicao",
    episode: 2,
    title: "Quarto 214",
    logline:
      "Marta usa o cartão do porta-luvas no Hotel Palácio. No quarto 214 espera-a a mulher da chamada — e a verdade sobre quem é o marido dela.",
    setting:
      "Sintra at dawn: the gravel courtyard of the manor, then the Hotel Palácio — a belle-époque hotel with a marble lobby, a long dim corridor with brass room numbers, and room 214 with curtains drawn.",
    visualBible:
      "Moody nocturnal thriller sliding into cold dawn, cinematic vertical 9:16, blue-grey first light against warm brass and dark wood of an old palace hotel, phone-screen glow, very shallow focus, slow creeping camera, long silences.",
    cast: [
      {
        name: "Marta Cunha",
        age: 38,
        look: "woman in her late thirties, long brown hair loose, black wool coat thrown over a black silk slip, engagement ring, dark red nails, no make-up, eyes red from no sleep",
        role: "mulher de Paulo",
      },
      {
        name: "Paulo Cunha",
        age: 42,
        look: "man in his early forties, short dark hair, trimmed beard, white t-shirt, phone to his ear at a window",
        role: "marido",
      },
      {
        name: "Sara Neves",
        age: 40,
        look: "woman of forty, sharp blonde bob, grey trench coat, no jewellery, a slim leather folder on her knees, very still",
        role: "a mulher da chamada",
      },
    ],
    beats: [
      {
        dur: 8,
        shot: "Dawn, gravel courtyard. Marta stands by the open car door with her ringing phone; she answers and looks up at Paulo's silhouette in the lit window. She keeps her voice light.",
        lines: [
          { who: "Paulo", text: "Marta? Que estás a fazer lá fora a esta hora?", tone: "sleepy, then sharp" },
          { who: "Marta", text: "Não conseguia dormir. Vim buscar o carregador ao carro.", tone: "forced calm" },
        ],
        sfx: "ringtone cut, wind, gravel",
      },
      {
        dur: 7,
        shot: "Close on Marta's hand hiding the hotel key card in her coat pocket. In the window above, Paulo does not move.",
        lines: [
          { who: "Paulo", text: "Deixa isso. Vem para cima.", tone: "even, watching her" },
          { who: "Marta", text: "Já vou.", tone: "whisper" },
        ],
      },
      {
        dur: 7,
        shot: "Cut: the car pulling out of the gates with the headlights off, Marta at the wheel, the manor shrinking in the mirror. The bedroom light is still on.",
        lines: [],
        sfx: "engine low, tyres on gravel, dawn birds",
      },
      {
        dur: 7,
        shot: "Hotel Palácio lobby, marble and brass, empty at dawn. Marta crosses it in her coat and slip; the night receptionist looks up from behind the desk.",
        lines: [
          { who: "Voz (rececionista)", text: "Bom dia, Dona Marta. O 214, como sempre.", tone: "polite, routine" },
          { who: "Marta", text: "...Como sempre?", tone: "stopped cold" },
        ],
        sfx: "heels on marble, a distant lift",
      },
      {
        dur: 7,
        shot: "Long dim corridor, brass numbers on dark doors. Marta walks slowly toward 214, key card shaking in her hand. She stops in front of the door.",
        lines: [{ who: "Marta", text: "Dona Marta...", tone: "murmur, disbelieving" }],
        sfx: "carpet hush, a clock somewhere",
      },
      {
        dur: 7,
        shot: "The lock clicks green. She pushes the door: curtains drawn, one lamp on. Sara Neves sits in an armchair facing the door, hands folded on a leather folder, waiting.",
        lines: [
          { who: "Sara", text: "Chegaste depressa. Ele ainda não te ligou outra vez?", tone: "calm, the phone voice in person" },
          { who: "Marta", text: "Quem és tu?", tone: "low, shaking" },
        ],
        sfx: "lock click, door, silence",
      },
      {
        dur: 7,
        shot: "Sara opens the folder on the small table and turns it toward Marta: a marriage certificate and a photograph of a younger Paulo with a different haircut. Marta does not sit.",
        lines: [
          { who: "Sara", text: "A mulher dele. A primeira. Casámos em Braga há catorze anos.", tone: "flat, factual" },
          { who: "Marta", text: "Isso é impossível. O Paulo nunca...", tone: "breaking" },
        ],
      },
      {
        dur: 7,
        shot: "Close on the certificate: the groom's name is not Paulo Cunha. Sara's finger rests on it.",
        lines: [
          { who: "Sara", text: "Não se chama Paulo. Chama-se Ricardo Sá. Enterrou o nome quando me deixou a mim... e uma dívida que ainda estou a pagar.", tone: "quiet, controlled anger" },
        ],
        sfx: "paper, her breath",
      },
      {
        dur: 7,
        shot: "Marta backs to the window and pulls the curtain an inch: dawn over Sintra. Sara stands behind her.",
        lines: [
          { who: "Sara", text: "Na terça-feira ele esteve neste quarto com um notário. Assinou a venda da tua casa, Marta. Com a tua assinatura.", tone: "slow, each word placed" },
        ],
      },
      {
        dur: 7,
        shot: "The room telephone rings on the nightstand, loud in the silence. Both women turn to it. Sara looks at Marta, almost gently. Hard cut to black on the last word.",
        lines: [{ who: "Sara", text: "É ele. Sabe que estás aqui.", tone: "calm, final" }],
        sfx: "hotel phone ringing, cut to silence",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    series: "regresso",
    episode: 2,
    title: "O irmão",
    logline:
      "Afonso desce as escadas e os dois irmãos ficam frente a frente pela primeira vez desde o funeral. A mãe sabia mais do que chorou.",
    setting:
      "The same stone kitchen in the Trás-os-Montes village, dawn fog outside the small window; a narrow wooden staircase; the kitchen table with a wood stove burning.",
    visualBible:
      "Rural Portuguese mystery, cinematic vertical 9:16, dawn fog over granite houses and slate roofs, desaturated cold greens and greys with a single warm kitchen light, static contemplative frames, long lenses, weathered faces.",
    cast: [
      {
        name: "Duarte Meireles",
        age: 45,
        look: "man in his mid-forties, weathered face, grey at the temples, thin scar through his left eyebrow, dark wool coat, standing very still",
        role: "o homem que voltou",
      },
      {
        name: "Afonso Meireles",
        age: 48,
        look: "man of forty-eight, heavier build, thinning dark hair, unshaven, faded flannel shirt and work trousers, bare feet on the stairs",
        role: "irmão de Duarte",
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
        shot: "The kitchen, dawn. All three look at the wooden staircase as bare feet come down step by step. Afonso stops on the last stair and sees Duarte. Nobody breathes.",
        lines: [{ who: "Afonso", text: "Não... Não, não, não.", tone: "whisper, going white" }],
        sfx: "stairs creaking, stove crackling, fog silence",
      },
      {
        dur: 7,
        shot: "Duarte does not move. Afonso grips the banister. Lurdes takes a step between them; Vieira stays at the door.",
        lines: [
          { who: "Duarte", text: "Olá, Afonso. Envelheceste.", tone: "flat" },
          { who: "Afonso", text: "Tu estavas morto. Eu vi-te... eu vi o caixão.", tone: "shaking" },
        ],
      },
      {
        dur: 7,
        shot: "Duarte crosses the kitchen slowly and stops a metre from his brother.",
        lines: [
          { who: "Duarte", text: "Viste um caixão fechado. Que tu mandaste fechar.", tone: "low, precise" },
          { who: "Afonso", text: "Eu salvei-te a vida!", tone: "bursting" },
        ],
      },
      {
        dur: 7,
        shot: "Close on Lurdes, eyes shut, rosary tight in her fist. Vieira watches her, not the brothers.",
        lines: [
          { who: "Afonso", text: "Os homens do Porto vinham buscar-te pela dívida do pai. Ou morrias no papel, ou morrias na serração.", tone: "desperate, fast" },
        ],
      },
      {
        dur: 7,
        shot: "Duarte lifts a hand to the scar on his eyebrow.",
        lines: [
          { who: "Duarte", text: "E isto? Também foi para me salvar?", tone: "cold" },
          { who: "Afonso", text: "Isso não fui eu. Juro por ela.", tone: "pointing at Lurdes, hoarse" },
        ],
      },
      {
        dur: 7,
        shot: "Lurdes opens her eyes. Both sons turn to her. Vieira lowers his cap.",
        lines: [
          { who: "Lurdes", text: "Fui eu que pedi o funeral.", tone: "barely audible" },
          { who: "Duarte", text: "Mãe...", tone: "stunned" },
        ],
        sfx: "stove, a long silence",
      },
      {
        dur: 7,
        shot: "Lurdes sits heavily at the table and looks at her hands.",
        lines: [
          { who: "Lurdes", text: "Um filho morto, os homens deixavam-nos em paz. Um filho fugido, vinham atrás de todos nós. Escolhi.", tone: "steady, broken" },
        ],
      },
      {
        dur: 7,
        shot: "Duarte kneels beside his mother's chair. Afonso stays on the stair, unable to come closer.",
        lines: [
          { who: "Duarte", text: "Quinze anos, mãe. Podia ter-vos escrito uma linha.", tone: "quiet, wet eyes" },
          { who: "Lurdes", text: "E eu podia ter deixado de te acender a vela. Não deixei.", tone: "whisper" },
        ],
      },
      {
        dur: 7,
        shot: "Vieira steps in from the door, voice low, looking at Afonso.",
        lines: [
          { who: "Inspetor Vieira", text: "Afonso. O homem do Porto ligou para o posto às seis da manhã. Perguntou pelo autocarro.", tone: "grave" },
          { who: "Afonso", text: "Ele já sabe.", tone: "hollow" },
        ],
        sfx: "fog, a dog barking far away",
      },
      {
        dur: 7,
        shot: "Headlights cut through the fog outside the small kitchen window and stop. An engine idles. Duarte rises slowly and looks at his brother. Hard cut to black on the last word.",
        lines: [{ who: "Duarte", text: "Então desta vez não vai haver caixão fechado.", tone: "flat, chilling" }],
        sfx: "engine idling, silence",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    series: "verao",
    episode: 2,
    title: "Dois irmãos, uma praia",
    logline:
      "Ricardo desce até à areia e encontra a noiva com o irmão. Inês tem de escolher agora — e Carla já escolheu há semanas.",
    setting:
      "Algarve beach at night: the wooden boardwalk lit by a car's headlights, dark sand, a beach bar with string lights behind, waves breaking white in the dark.",
    visualBible:
      "Sun-drenched Portuguese summer romance turned tense, cinematic vertical 9:16, now blue night with harsh headlight beams and warm string lights, sea spray, skin glow, handheld intimacy, natural sound of waves.",
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
        name: "Ricardo Santos",
        age: 32,
        look: "man of thirty-two, dark neat hair, clean-shaven, white dress shirt with sleeves rolled, navy trousers, expensive watch, city shoes sinking in the sand",
        role: "noivo de Inês, irmão de Miguel",
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
        shot: "Night beach. Ricardo walks down the boardwalk against the headlights and stops on the sand three metres from Miguel, who stands in front of Inês. Carla hangs back with her phone.",
        lines: [
          { who: "Ricardo", text: "Miguel. Quatro anos sem me atenderes o telefone, e é assim que te encontro.", tone: "quiet, dangerous" },
          { who: "Miguel", text: "Ricardo.", tone: "flat" },
        ],
        sfx: "waves, engine cooling, string-light hum",
      },
      {
        dur: 7,
        shot: "Ricardo looks past his brother at Inês. She steps out from behind Miguel.",
        lines: [
          { who: "Ricardo", text: "Inês. Disseste-me que estavas com a Carla.", tone: "controlled" },
          { who: "Inês", text: "E estava. Ricardo, eu não sabia que ele era...", tone: "pleading" },
        ],
      },
      {
        dur: 7,
        shot: "Close on Ricardo: a small, bitter smile. He takes off his watch and puts it in his pocket, as if preparing for something.",
        lines: [
          { who: "Ricardo", text: "Meu irmão. Eu sei. Foi por isso que nunca te falei dele.", tone: "cold" },
        ],
      },
      {
        dur: 7,
        shot: "Miguel steps forward. The brothers face to face in the headlight beam, the same jaw, the same eyes.",
        lines: [
          { who: "Miguel", text: "Falaste dela a mim? Também não. Quatro anos, Ricardo. Nem um casamento.", tone: "hurt, rising" },
          { who: "Ricardo", text: "Não te convidei porque sabia que farias isto.", tone: "even" },
        ],
      },
      {
        dur: 7,
        shot: "Inês grabs Miguel's arm and pulls him back. Carla, behind, lowers her phone slowly.",
        lines: [
          { who: "Inês", text: "Parem. Os dois. Ricardo, como é que sabias onde eu estava?", tone: "sharp, sudden" },
        ],
        sfx: "waves, a held breath",
      },
      {
        dur: 7,
        shot: "Ricardo does not answer. He looks at Carla. Inês follows his eyes. Carla's face in the headlights: caught.",
        lines: [
          { who: "Ricardo", text: "Pergunta à tua melhor amiga.", tone: "quiet" },
          { who: "Carla", text: "Inês... eu ia contar-te.", tone: "small, cracking" },
        ],
      },
      {
        dur: 7,
        shot: "Inês takes a step toward Carla; Carla backs up onto the boardwalk.",
        lines: [
          { who: "Inês", text: "Contar-me o quê?", tone: "low" },
          { who: "Carla", text: "Que lhe mandei as fotografias. Todas. Desde o primeiro dia.", tone: "through tears" },
        ],
      },
      {
        dur: 7,
        shot: "Miguel turns to Carla, then to Ricardo, understanding. Ricardo watches Inês, only Inês.",
        lines: [
          { who: "Miguel", text: "Sabias desde o início e deixaste-a ficar?", tone: "disbelief" },
          { who: "Ricardo", text: "Queria ver até onde ela ia. Agora sei.", tone: "cold, wounded" },
        ],
      },
      {
        dur: 7,
        shot: "Ricardo takes a folded paper from his shirt pocket and holds it out to Inês without stepping closer.",
        lines: [
          { who: "Ricardo", text: "O casamento não é em setembro, Inês. Mudei a data ontem. É sábado. Ou vens comigo agora, ou não vens.", tone: "final" },
        ],
        sfx: "paper, wind, waves",
      },
      {
        dur: 7,
        shot: "Inês between the two brothers, the paper in one hand, Miguel's hand reaching for the other. Carla whispers from the boardwalk. Hard cut to black on Inês's face.",
        lines: [
          { who: "Carla", text: "Inês... há mais uma coisa que ele não te disse. Sobre porque é que o Miguel se foi embora.", tone: "urgent whisper" },
        ],
        sfx: "waves, cut to silence",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    series: "divida",
    episode: 2,
    title: "A sogra sabia",
    logline:
      "Dona Isabel tirou a fotografia para proteger Teresa e fechou-a no cofre. Só mais uma pessoa tem a chave — e o prazo baixou para 47 horas.",
    setting:
      "The Porto townhouse the same night, after dinner: Dona Isabel's private sitting room with a small wall safe behind a painting, lamplight; the marble hallway with the antique clock; a bedroom door ajar.",
    visualBible:
      "Elegant family suspense, cinematic vertical 9:16, candle and lamp light with gold and deep green tones, the ornate antique clock looming, symmetrical framings broken by nervous handheld close-ups, ticking clock as heartbeat.",
    cast: [
      {
        name: "Teresa Amaral",
        age: 44,
        look: "woman in her mid-forties, dark hair in an elegant updo coming loose, emerald green silk dress, pearl earrings and bracelet",
        role: "matriarca em risco",
      },
      {
        name: "Dona Isabel",
        age: 68,
        look: "woman of sixty-eight, silver hair pinned back, cream blouse, gold brooch, watchful eyes, a small brass key on a chain",
        role: "sogra",
      },
      {
        name: "Vasco Amaral",
        age: 24,
        look: "young man of twenty-four, dark hair, open-collar white shirt under a navy blazer, sleeves pushed up",
        role: "filho",
      },
      {
        name: "Joaquim Amaral",
        age: 58,
        look: "man in his late fifties, grey beard, dark suit and tie, calm heavy presence",
        role: "marido",
      },
    ],
    beats: [
      {
        dur: 8,
        shot: "Isabel's sitting room, lamplight. Teresa closes the door behind them and leans on it. Isabel sits, calm, and pours two small glasses of port.",
        lines: [
          { who: "Teresa", text: "A senhora tirou aquela fotografia?", tone: "hissed" },
          { who: "Dona Isabel", text: "Senta-te, Teresa. E não me trates por senhora em minha casa. Somos família.", tone: "calm, steel" },
        ],
        sfx: "door, port poured, clock through the wall",
      },
      {
        dur: 7,
        shot: "Teresa does not sit. Isabel turns the glass slowly in her fingers.",
        lines: [
          { who: "Dona Isabel", text: "Segui-te ao hotel em março. Não para te apanhar. Para saber com quem andavas a pôr a minha família em risco.", tone: "measured" },
        ],
      },
      {
        dur: 7,
        shot: "Isabel rises, swings a small painting aside: a wall safe. She opens it with the brass key from her chain. Inside, an envelope — and nothing else.",
        lines: [
          { who: "Dona Isabel", text: "Guardei-a aqui. Um único negativo. Ninguém a devia ter visto.", tone: "quiet" },
          { who: "Teresa", text: "Então quem a enviou?", tone: "shaking" },
        ],
        sfx: "painting hinge, safe dial, paper",
      },
      {
        dur: 7,
        shot: "Isabel opens the envelope: it is empty. Close on her face — the first crack in her composure.",
        lines: [{ who: "Dona Isabel", text: "O negativo desapareceu.", tone: "whisper, real fear" }],
      },
      {
        dur: 7,
        shot: "Teresa steps close. Two-shot, both women lit from below by the lamp.",
        lines: [
          { who: "Teresa", text: "Quem mais tem a chave, Isabel?", tone: "low, urgent" },
          { who: "Dona Isabel", text: "Só há duas. A minha... e a que dei ao meu neto quando fez dezoito anos.", tone: "slow, not wanting to say it" },
        ],
      },
      {
        dur: 7,
        shot: "Teresa turns to the door. The hallway clock ticks. Her reflection in the dark window: the green dress, the loosened hair.",
        lines: [{ who: "Teresa", text: "O Vasco.", tone: "barely a sound" }],
        sfx: "clock ticking louder",
      },
      {
        dur: 7,
        shot: "Marble hallway. Teresa walks fast toward Vasco's bedroom door, ajar, light inside. Joaquim's voice from the dining room behind her.",
        lines: [
          { who: "Joaquim", text: "Teresa? Vais deitar-te sem te despedires?", tone: "casual, from another room" },
          { who: "Teresa", text: "Já vou, Joaquim.", tone: "too bright" },
        ],
      },
      {
        dur: 7,
        shot: "Vasco's room. He sits on the bed with a laptop, a spreadsheet of red numbers on the screen. He shuts it when she enters. She holds up the empty envelope.",
        lines: [
          { who: "Teresa", text: "Quinhentos mil. É exactamente o que deves, não é?", tone: "quiet, devastated" },
          { who: "Vasco", text: "Mãe...", tone: "caught" },
        ],
        sfx: "laptop closing",
      },
      {
        dur: 7,
        shot: "Vasco stands. Close on him: not ashamed — cornered, and hard.",
        lines: [
          { who: "Vasco", text: "Eles matam-me na sexta-feira, mãe. O pai não me dá um cêntimo. A mãe tem o dinheiro da avó. Eu só preciso que o pague.", tone: "fast, breaking" },
        ],
      },
      {
        dur: 7,
        shot: "Teresa looks at her son for a long beat. Behind her, in the doorway, Joaquim has appeared in silence, the photograph in his hand. Hard cut to black on the last word.",
        lines: [{ who: "Joaquim", text: "Que dinheiro, Teresa?", tone: "very calm" }],
        sfx: "clock strikes, silence",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    series: "fogo",
    episode: 2,
    title: "O nome",
    logline:
      "Rui, ferido, diz o nome de quem os traiu: o comissário que os formou. E o comissário acaba de chegar ao armazém para assumir a cena.",
    setting:
      "The same abandoned warehouse in Marvila, Lisbon, minutes later: blue police lights strobing through broken windows, an ambulance backing in, rain starting to fall through the roof.",
    visualBible:
      "Gritty Portuguese police thriller, cinematic vertical 9:16, dusty flashlight beams cutting through darkness, strobing blue police light through broken windows, handheld urgency, desaturated teal and rust, realistic tactical detail.",
    cast: [
      {
        name: "Inspetora Sofia Rocha",
        age: 34,
        look: "woman of thirty-four, dark hair tied back tight, black tactical vest marked 'PJ' over a grey shirt, holstered pistol, blood on her hands",
        role: "inspetora da Polícia Judiciária",
      },
      {
        name: "Inspetor Rui Baptista",
        age: 40,
        look: "man of forty, shaved head, dark stubble, black tactical vest marked 'PJ', lying on concrete, shoulder bleeding through a pressed cloth",
        role: "parceiro de Sofia",
      },
      {
        name: "Leandro",
        age: 35,
        look: "man of thirty-five, bruised face, split lip, grey tracksuit, gold chain, cut zip ties on his wrists",
        role: "informador",
      },
      {
        name: "Comissário Castro",
        age: 56,
        look: "man of fifty-six, silver hair, long dark overcoat over a suit, PJ badge on a lanyard, umbrella, unhurried authority",
        role: "comissário — formou Sofia e Rui na academia",
      },
    ],
    beats: [
      {
        dur: 8,
        shot: "Warehouse floor, blue strobe. Sofia presses both hands on Rui's shoulder wound; Leandro crouches behind a pillar, eyes on the broken window. Sirens closer.",
        lines: [
          { who: "Sofia", text: "Diz-me o nome, Rui. Agora.", tone: "urgent, low" },
          { who: "Rui", text: "Primeiro tira o Leandro daqui.", tone: "gasping" },
        ],
        sfx: "sirens, rain starting on the roof, dripping",
      },
      {
        dur: 7,
        shot: "Close on Rui, teeth clenched, gripping her vest.",
        lines: [
          { who: "Rui", text: "Castro. Foi o Castro.", tone: "forcing it out" },
          { who: "Sofia", text: "O comissário? Ele formou-nos, Rui.", tone: "disbelief" },
        ],
      },
      {
        dur: 7,
        shot: "Rui coughs, nods toward Leandro.",
        lines: [
          { who: "Rui", text: "O telemóvel do Leandro. Estava com o Castro às oito. Vi-o na secretária dele.", tone: "hoarse" },
          { who: "Leandro", text: "Está tudo lá dentro. Nomes, transferências. Tudo.", tone: "whisper" },
        ],
      },
      {
        dur: 7,
        shot: "Sofia looks at Leandro, then at the door where paramedics are running in with a stretcher. She makes a decision.",
        lines: [
          { who: "Sofia", text: "Leandro, sai pelas traseiras. Não fales com ninguém de colete. Ninguém.", tone: "fast command" },
        ],
        sfx: "paramedics shouting, stretcher wheels",
      },
      {
        dur: 7,
        shot: "Leandro slips into the dark behind the pillars. Paramedics take over Rui. Sofia stands, hands red, and turns to the doorway as a long overcoat enters under an umbrella.",
        lines: [{ who: "Comissário Castro", text: "Rocha. Onde está o informador?", tone: "calm, authoritative" }],
      },
      {
        dur: 7,
        shot: "Sofia and Castro face each other in the blue strobe. Rui is wheeled past between them; his eyes lock on Sofia.",
        lines: [
          { who: "Sofia", text: "Fugiu quando começaram os tiros, comissário.", tone: "steady lie" },
          { who: "Comissário Castro", text: "Fugiu. Com as mãos atadas.", tone: "dry" },
        ],
      },
      {
        dur: 7,
        shot: "Castro looks down at the cut zip ties on the floor, then at her knife still in her hand.",
        lines: [
          { who: "Comissário Castro", text: "Sofia. Sabes quem me ligou há vinte minutos para dizer que ias estar aqui? O Baptista.", tone: "quiet, planting doubt" },
        ],
        sfx: "rain, radio static",
      },
      {
        dur: 7,
        shot: "Close on Sofia: the doubt lands. She glances at the ambulance doors closing on Rui.",
        lines: [
          { who: "Sofia", text: "Isso é mentira.", tone: "not sure" },
          { who: "Comissário Castro", text: "Então vê o registo de chamadas. Depois falamos.", tone: "reasonable, warm" },
        ],
      },
      {
        dur: 7,
        shot: "Castro steps closer and holds out his hand, palm up.",
        lines: [
          { who: "Comissário Castro", text: "O telemóvel do Leandro. É prova. Entrega-mo.", tone: "gentle order" },
          { who: "Sofia", text: "Não o tenho.", tone: "flat" },
        ],
      },
      {
        dur: 7,
        shot: "Castro's smile fades. His hand stays out. Sofia's hand drifts to her holster. Two officers behind him stop moving. Hard cut to black on the last word.",
        lines: [{ who: "Comissário Castro", text: "Inspetora Rocha. É uma ordem direta.", tone: "ice" }],
        sfx: "rain, holster snap, silence",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    series: "promessa",
    episode: 2,
    title: "Cais de Alcântara",
    logline:
      "Sábado, seis da tarde. O barco parte, Frederico está preso e Amélia chega ao cais de vestido de noiva — e não é a única com um nome na lista.",
    setting:
      "Lisbon, June 1943, Saturday evening: the Lapa mansion salon dressed for a wedding, then Cais de Alcântara — a grey ocean liner at the quay, gangway, porters, PVDE agents in hats, refugees with suitcases.",
    visualBible:
      "1940s period drama, cinematic vertical 9:16, warm sepia-leaning palette turning to steel-grey river light at the quay, period-accurate costumes (pinned hair, tailored dresses, hats, brown suits), steam, gulls, restrained classical framing.",
    cast: [
      {
        name: "Amélia Castelo",
        age: 24,
        look: "woman of twenty-four, dark hair pinned in 1940s victory rolls, ivory satin wedding dress with long sleeves, small pearl earrings, no veil, a small leather suitcase",
        role: "filha do Coronel",
      },
      {
        name: "Frederico Lima",
        age: 28,
        look: "man of twenty-eight, brown wool suit now creased, no tie, bruised cheekbone, ink-stained fingers, wrists in handcuffs",
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
        look: "man of forty-five, blond slicked hair, grey double-breasted suit, thin smile, a passport in his gloved hand",
        role: "diplomata alemão",
      },
    ],
    beats: [
      {
        dur: 8,
        shot: "Lapa salon dressed with white flowers, five in the afternoon. Amélia in the ivory wedding dress stands at the window with her back to the room. The Coronel enters, adjusting his medals.",
        lines: [
          { who: "Coronel Castelo", text: "O carro está à porta. Herr Weber já está na igreja.", tone: "formal, pleased" },
          { who: "Amélia", text: "Já vou, pai. Deixe-me um minuto sozinha.", tone: "even" },
        ],
        sfx: "clock, distant church bells, a car idling",
      },
      {
        dur: 7,
        shot: "He leaves. She turns: the small leather suitcase is already behind the curtain. She lifts it, opens the garden door, and walks out into the light in the wedding dress.",
        lines: [],
        sfx: "door latch, gravel, bells",
      },
      {
        dur: 7,
        shot: "Cais de Alcântara, grey river light. The liner towers over the quay; steam, gulls, a crowd of refugees with suitcases. Amélia in white pushes through toward the gangway, checking the pocket watch.",
        lines: [{ who: "Amélia", text: "Cinco e cinquenta... cinco e cinquenta.", tone: "whispered, counting" }],
        sfx: "ship horn, gulls, crowd, steam",
      },
      {
        dur: 7,
        shot: "At the foot of the gangway a PVDE agent checks names on a clipboard. Amélia stops. Beside him, in a grey double-breasted suit, stands Herr Weber.",
        lines: [
          { who: "Herr Weber", text: "Menina Amélia. Está bonita. Se bem que a igreja fica na outra direção.", tone: "German-accented Portuguese, dry" },
          { who: "Amélia", text: "Vim despedir-me de um amigo.", tone: "steady" },
        ],
      },
      {
        dur: 7,
        shot: "Weber steps closer and lowers his voice, turning them both away from the agent.",
        lines: [
          { who: "Herr Weber", text: "Não veio. Veio partir. O seu nome está nessa lista há três semanas. Eu sei porque também lá está o meu.", tone: "quiet, urgent" },
        ],
        sfx: "steam, gulls",
      },
      {
        dur: 7,
        shot: "Close on Amélia, the world tilting. Weber shows her, half-hidden in his glove, a passport with another name and a Star of David stamp.",
        lines: [
          { who: "Herr Weber", text: "Weber não é o meu nome. O casamento era o meu visto, menina. E o seu.", tone: "almost gentle" },
          { who: "Amélia", text: "O meu pai sabe?", tone: "whisper" },
        ],
      },
      {
        dur: 7,
        shot: "Weber's silence answers. Behind them, a black car stops on the quay. Two PVDE agents step out with a handcuffed man between them: Frederico, bruised, squinting at the light.",
        lines: [{ who: "Amélia", text: "Frederico!", tone: "breaking" }],
        sfx: "car doors, boots on stone",
      },
      {
        dur: 7,
        shot: "Frederico sees her in the wedding dress and stops dead. The agents hold him. Weber steps between Amélia and the car.",
        lines: [
          { who: "Frederico", text: "Casaste-te.", tone: "hollow" },
          { who: "Amélia", text: "Não. Fugi.", tone: "through tears" },
        ],
      },
      {
        dur: 7,
        shot: "The Coronel steps out of the black car last, in full uniform, and looks at his daughter, the suitcase, the gangway. A long beat. The ship's horn sounds once.",
        lines: [
          { who: "Coronel Castelo", text: "Trouxe-o para ver o barco partir, Amélia. Não sabia que também te vinha ver a ti.", tone: "quiet, wounded" },
        ],
        sfx: "ship horn, gulls",
      },
      {
        dur: 7,
        shot: "The gangway begins to lift. Amélia looks from her father to Frederico in handcuffs to Weber holding out his gloved hand toward the ship. The Coronel unbuttons his holster. Hard cut to black on the last word.",
        lines: [{ who: "Coronel Castelo", text: "Escolhe, filha. Mas escolhe agora.", tone: "flat, final" }],
        sfx: "gangway chains, horn, silence",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    series: "patroa",
    episode: 3,
    title: "Quem o empurrou",
    logline:
      "Artur Meneses, sócio de Helena há dez anos, sai do carro na fábrica. Sabe que ela falou — porque foi ele que mandou pôr o microfone no carro de Tiago.",
    setting:
      "The abandoned canning factory in Setúbal, seven in the morning: fog thinning, a second black car at the rusted gates, the vast empty floor, the stained concrete beneath the gantry.",
    visualBible:
      "Sleek corporate noir in daylight ruin, cinematic vertical 9:16, cold grey dawn light through broken skylights, dust in the air, rust and peeling paint against immaculate black tailoring, shallow depth of field, slow controlled camera moves, restrained performances.",
    cast: [
      {
        name: "Helena Vasconcelos",
        age: 41,
        look: "woman in her early forties, long dark wavy hair, strong brows, black tailored suit over a low black top under a long black wool coat, thin gold necklace and gold bracelet, composed and intimidating",
        role: "CEO do Grupo Vasconcelos",
      },
      {
        name: "Tiago Ferreira",
        age: 30,
        look: "man of thirty, dark curly hair, clean-shaven, strong jaw, black suit with black shirt and black tie, a yellowed folded document in his fist",
        role: "motorista — filho do chefe de turno que morreu na fábrica",
      },
      {
        name: "Artur Meneses",
        age: 55,
        look: "man of fifty-five, silver hair combed back, tanned, camel overcoat over a navy suit, signet ring, easy smile that never reaches the eyes",
        role: "sócio e diretor de operações do Grupo Vasconcelos",
      },
    ],
    beats: [
      {
        dur: 8,
        shot: "Factory gates, fog thinning. Artur Meneses steps out of the second black car, buttons his camel coat and walks in without hurry. Helena waits; Tiago stays two steps behind her with the paper.",
        lines: [
          { who: "Artur", text: "Helena. Sete da manhã em Setúbal. Já não me convidas para nada.", tone: "warm, amused" },
          { who: "Helena", text: "Chegaste cedo, Artur.", tone: "cold" },
        ],
        sfx: "car door, gravel, gulls",
      },
      {
        dur: 7,
        shot: "Artur stops under the gantry and looks at the stained concrete, then at Tiago. Recognition, slow and pleased.",
        lines: [
          { who: "Artur", text: "E este é o rapaz. Tens os olhos do teu pai. Ele também não sabia quando parar de falar.", tone: "pleasant, cruel" },
        ],
      },
      {
        dur: 7,
        shot: "Tiago lunges; Helena's arm stops him without her looking away from Artur.",
        lines: [
          { who: "Tiago", text: "Foi você.", tone: "breaking, furious" },
          { who: "Helena", text: "Tiago. Não.", tone: "quiet command" },
        ],
      },
      {
        dur: 7,
        shot: "Artur takes a small black device from his coat pocket and holds it up between two fingers: a microphone the size of a coin.",
        lines: [
          { who: "Artur", text: "Estava no teu carro, Helena. Desde que o contrataste. Ouvi tudo. A fábrica, o relatório... o teu pequeno discurso.", tone: "light" },
        ],
        sfx: "wind through metal",
      },
      {
        dur: 7,
        shot: "Helena does not flinch. Close on her: something like a smile.",
        lines: [
          { who: "Helena", text: "Eu sei. Fui eu que o deixei lá.", tone: "calm" },
          { who: "Artur", text: "Perdão?", tone: "the smile slipping" },
        ],
      },
      {
        dur: 7,
        shot: "Helena walks toward Artur, heels on concrete, and stops close.",
        lines: [
          { who: "Helena", text: "Precisava que viesses. Precisava que ele te visse. E precisava que dissesses o que acabaste de dizer... com a Polícia Judiciária a ouvir.", tone: "steady, lethal" },
        ],
      },
      {
        dur: 7,
        shot: "Artur looks up: on the gantry above, a figure with a camera; at the gates, an unmarked car has appeared in the fog. He laughs, short and cold.",
        lines: [
          { who: "Artur", text: "Dez anos, Helena. Dez anos a assinar ao teu lado.", tone: "low" },
          { who: "Helena", text: "Dez anos a saber o que fizeste. Demorei a arranjar coragem.", tone: "quiet" },
        ],
        sfx: "car engine at the gates, gulls",
      },
      {
        dur: 7,
        shot: "Artur turns to Tiago, suddenly very calm, and nods at the paper in his fist.",
        lines: [
          { who: "Artur", text: "Rapaz. Lê a última página desse relatório. Lê quem assinou a ordem para o teu pai subir àquela plataforma sem arnês.", tone: "soft, poisonous" },
        ],
      },
      {
        dur: 7,
        shot: "Tiago unfolds the last page with shaking hands. Close on the signature line. His eyes lift slowly to Helena.",
        lines: [
          { who: "Tiago", text: "Helena Vasconcelos.", tone: "reading, dead voice" },
          { who: "Helena", text: "Tiago, eu tinha vinte e nove anos e não sabia...", tone: "for the first time, unsteady" },
        ],
        sfx: "paper, wind",
      },
      {
        dur: 7,
        shot: "Tiago steps back from both of them. Artur smiles. The unmarked car's doors open at the gates. Hard cut to black on the last word.",
        lines: [{ who: "Artur", text: "Vês? Ninguém aqui tem as mãos limpas, rapaz. Escolhe com quem te vais embora.", tone: "gentle, victorious" }],
        sfx: "car doors, gulls, silence",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    series: "sangue",
    episode: 3,
    title: "A filha do patriarca",
    logline:
      "Ao nascer do dia, Graça tem a prova de que é filha de Augusto Sequeira. Rodrigo tem até às dez da manhã para a fazer desaparecer — mas alguém chegou ao palácio antes dele.",
    setting:
      "Palácio Sequeira, Sintra, at first light after the rain: the servants' kitchen with copper pans, the wine cellar stairs, the gilded study with the third envelope still on the desk.",
    visualBible:
      "Premium Portuguese TV drama, cinematic vertical 9:16, cold blue dawn seeping into warm tungsten interiors, crimson walls and gilded frames, wet windows, shallow depth of field, slow handheld push-ins, rich shadows, film grain, naturalistic acting.",
    cast: [
      {
        name: "Beatriz Sequeira",
        age: 32,
        look: "woman in her early thirties, dark brown hair now loose over her shoulders, brown eyes, black satin slip dress under a man's grey cardigan, diamond necklace, barefoot",
        role: "neta preferida do patriarca",
      },
      {
        name: "Rodrigo Sequeira",
        age: 36,
        look: "man in his mid-thirties, short dark hair, dark stubble, sharp jaw, black suit trousers and black shirt unbuttoned at the collar, car keys in hand",
        role: "irmão de Beatriz",
      },
      {
        name: "Dona Graça",
        age: 60,
        look: "woman of sixty, grey hair pinned back, black housekeeper's dress with a white collar, small silver crucifix, a bundle of old letters tied with ribbon",
        role: "governanta do palácio há trinta anos — filha de Augusto Sequeira",
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
        shot: "Servants' kitchen at first light, copper pans catching the blue. Dona Graça sits at the wooden table untying a ribbon around a bundle of old letters. Beatriz, in a borrowed cardigan, stands in the doorway.",
        lines: [
          { who: "Beatriz", text: "Não dormiu.", tone: "soft" },
          { who: "Dona Graça", text: "Há trinta anos que não durmo nesta casa, menina.", tone: "tired, gentle" },
        ],
        sfx: "birds, dripping gutters, paper",
      },
      {
        dur: 7,
        shot: "Graça slides one letter across the table. Close on the handwriting and a signature: 'Augusto'. Beatriz reads.",
        lines: [
          { who: "Dona Graça", text: "Escreveu-me uma por ano. No meu aniversário. Nunca me chamou filha. Chamava-me 'a minha vergonha'.", tone: "flat, no self-pity" },
        ],
      },
      {
        dur: 7,
        shot: "Beatriz sits. Her hand covers Graça's on the table.",
        lines: [
          { who: "Beatriz", text: "E ficou. Trinta anos a servir-lhe o jantar.", tone: "quiet disbelief" },
          { who: "Dona Graça", text: "Fiquei para o ver todos os dias a fingir que não me via. Era o meu castigo para ele.", tone: "steady" },
        ],
      },
      {
        dur: 7,
        shot: "Footsteps. Rodrigo in the kitchen doorway, car keys in his hand, a thick envelope in the other. He does not look at Beatriz.",
        lines: [
          { who: "Rodrigo", text: "Dona Graça. O carro está à porta. Duzentos mil euros e um bilhete para o Porto às oito e meia. Assine e vá.", tone: "brisk, businesslike" },
        ],
        sfx: "keys, envelope on the table",
      },
      {
        dur: 7,
        shot: "Graça looks at the envelope, then at Rodrigo, and does not touch it.",
        lines: [
          { who: "Dona Graça", text: "Uma renúncia à herança. Em troca de dinheiro.", tone: "quiet" },
          { who: "Rodrigo", text: "Em troca de paz. Para todos. Às dez o notário lê aquilo em voz alta e a senhora passa a ser notícia.", tone: "reasonable, threatening" },
        ],
      },
      {
        dur: 7,
        shot: "Beatriz stands between them.",
        lines: [
          { who: "Beatriz", text: "Ela não assina nada, Rodrigo.", tone: "sharp" },
          { who: "Rodrigo", text: "Ela não é da família, Beatriz. É a empregada que o avô... usou. Não a confundas com uma tia.", tone: "cold" },
        ],
      },
      {
        dur: 7,
        shot: "Graça rises slowly and pushes the envelope back across the table with one finger.",
        lines: [
          { who: "Dona Graça", text: "Menino Rodrigo. Eu mudei-lhe as fraldas. Não me venha ensinar quem é família nesta casa.", tone: "dignified, cutting" },
        ],
        sfx: "envelope sliding, a chair",
      },
      {
        dur: 7,
        shot: "Rodrigo's jaw tightens. He looks at the letters on the table, then grabs the bundle. Beatriz seizes his wrist.",
        lines: [
          { who: "Rodrigo", text: "Sem isto não prova nada.", tone: "low" },
          { who: "Beatriz", text: "Larga.", tone: "ice" },
        ],
      },
      {
        dur: 7,
        shot: "The kitchen door opens: Dr. Nuno Alves, coat over his arm, out of breath, folder clutched to his chest. He looks at the three of them.",
        lines: [
          { who: "Dr. Nuno Alves", text: "Peço desculpa. Não há leitura às dez.", tone: "grave, shaken" },
          { who: "Rodrigo", text: "Como assim, não há?", tone: "sharp" },
        ],
        sfx: "door, wind",
      },
      {
        dur: 7,
        shot: "Nuno sets the folder on the table. Close on his face, then on Graça, who has gone very still. Hard cut to black on the last word.",
        lines: [
          { who: "Dr. Nuno Alves", text: "Porque o vosso pai chegou ao palácio há uma hora. E veio contestar o testamento... em nome dele e em nome da Dona Graça.", tone: "measured, devastating" },
        ],
        sfx: "clock, silence",
      },
    ],
  },
];
