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
];
