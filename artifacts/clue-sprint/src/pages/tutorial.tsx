import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, Lightbulb, RotateCcw, Sparkles } from 'lucide-react';
import { tutorialIntroduction, tutorialTypes, type TutorialExample, type TutorialType } from '@/pages/tutorial-content';

export default function TutorialPage() {
  const [typeId, setTypeId] = useState(tutorialTypes[0]?.id ?? '');
  const [exampleIndex, setExampleIndex] = useState(0);
  const [guess, setGuess] = useState('');
  const [checked, setChecked] = useState<'correct' | 'incorrect' | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);
  const [completed, setCompleted] = useState<string[]>([]);

  const activeType: TutorialType = tutorialTypes.find((item) => item.id === typeId) ?? tutorialTypes[0];
  const example: TutorialExample | undefined = activeType?.examples[exampleIndex];
  if (!activeType || !example) return null;

  const changeType = (nextId: string) => {
    setTypeId(nextId);
    setExampleIndex(0);
    setGuess('');
    setChecked(null);
    setHintOpen(false);
    setAnswerOpen(false);
  };

  const changeExample = (nextIndex: number) => {
    const safeIndex = Math.max(0, Math.min(activeType.examples.length - 1, nextIndex));
    setExampleIndex(safeIndex);
    setGuess('');
    setChecked(null);
    setHintOpen(false);
    setAnswerOpen(false);
  };

  const checkAnswer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedGuess = guess.trim().replace(/[^a-z0-9]/gi, '').toUpperCase();
    if (!normalizedGuess) {
      setChecked('incorrect');
      return;
    }
    const isCorrect = normalizedGuess === example.answer.replace(/[^a-z0-9]/gi, '').toUpperCase();
    setChecked(isCorrect ? 'correct' : 'incorrect');
    if (isCorrect) {
      setCompleted((previous) => previous.includes(example.id) ? previous : [...previous, example.id]);
    }
  };

  const revealAnswer = () => {
    setAnswerOpen(true);
    setCompleted((previous) => previous.includes(example.id) ? previous : [...previous, example.id]);
  };

  const progressPercent = ((exampleIndex + 1) / activeType.examples.length) * 100;
  const typeCompleted = activeType.examples.filter((item) => completed.includes(item.id)).length;

  return (
    <main className="tutorial-page">
      <section className="tutorial-hero">
        <div className="page-wrap tutorial-hero-inner">
          <div className="tutorial-hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> A FRIENDLY FIELD GUIDE</div>
            <h1 className="tutorial-title">Cryptics, <em>decoded.</em></h1>
            <p>{tutorialIntroduction.intro}</p>
            <div className="tutorial-hero-foot"><span className="tutorial-star"><Sparkles size={16} /></span> Pick a clue style. Try one at your own pace.</div>
          </div>
          <div className="tutorial-hero-note" aria-label="Clue solving note">
            <span className="tutorial-note-number">01</span>
            <div className="tutorial-note-tiles"><i>D</i><i>E</i><i>F</i><i className="tile-highlight">?</i></div>
            <p>Two routes.<br /><strong>One answer.</strong></p>
            <span className="tutorial-note-caption">THE LITTLE SECRET</span>
          </div>
        </div>
      </section>

      <section className="tutorial-intro-section">
        <div className="page-wrap tutorial-intro-grid">
          <div className="tutorial-section-heading">
            <div className="eyebrow"><span className="eyebrow-dot" /> START WITH THE BASICS</div>
            <h2>{tutorialIntroduction.title}</h2>
          </div>
          <div className="tutorial-intro-content">
            <p className="tutorial-intro-lead">Every clue is a small invitation to look twice.</p>
            <div className="tutorial-parts">
              {tutorialIntroduction.parts.map((part, index) => (
                <article className="tutorial-part" key={part.term} data-testid={`tutorial-part-${index}`}>
                  <span className="tutorial-part-index">{String(index + 1).padStart(2, '0')}</span>
                  <div><h3>{part.term}</h3><p>{part.text}</p></div>
                </article>
              ))}
            </div>
            <p className="tutorial-note"><strong>A note on fairness</strong>{tutorialIntroduction.note}</p>
          </div>
        </div>
      </section>

      <section className="tutorial-practice" id="practice">
        <div className="page-wrap">
          <div className="tutorial-practice-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-dot" /> YOUR PRACTICE TABLE</div>
              <h2>Choose a way in.</h2>
              <p>Each style has five original clues. Take a guess, ask for a nudge, or reveal the working.</p>
            </div>
            <div className="tutorial-total"><strong>{completed.length}</strong><span>of {tutorialTypes.reduce((sum, type) => sum + type.examples.length, 0)} completed</span></div>
          </div>

          <div className="tutorial-workspace">
            <aside className="tutorial-type-rail" aria-label="Clue types">
              <div className="tutorial-rail-label">CLUE STYLES <span>08</span></div>
              {tutorialTypes.map((type, index) => (
                <button
                  className={`tutorial-type-choice ${type.id === typeId ? 'is-selected' : ''}`}
                  key={type.id}
                  type="button"
                  onClick={() => changeType(type.id)}
                  aria-current={type.id === typeId ? 'true' : undefined}
                  data-testid={`button-type-${type.id}`}
                >
                  <span className="tutorial-type-num">{String(index + 1).padStart(2, '0')}</span>
                  <span className="tutorial-type-label">{type.title}</span>
                  {type.examples.every((item) => completed.includes(item.id)) && <Check size={15} aria-label="Completed" />}
                </button>
              ))}
              <p className="tutorial-rail-note">No timer. No pressure. Just the satisfying click.</p>
            </aside>

            <div className="tutorial-lesson">
              <div className="tutorial-lesson-top">
                <div>
                  <span className="form-index">LESSON {String(tutorialTypes.findIndex((item) => item.id === typeId) + 1).padStart(2, '0')}</span>
                  <h3>{activeType.title}</h3>
                  <p className="tutorial-type-summary">{activeType.summary}</p>
                </div>
                <span className="tutorial-solved-count">{typeCompleted}/{activeType.examples.length} completed</span>
              </div>
              <p className="tutorial-lesson-copy">{activeType.lesson}</p>

              <article className="tutorial-clue-card" key={example.id}>
                <div className="tutorial-example-meta">
                  <span>EXAMPLE {String(exampleIndex + 1).padStart(2, '0')}</span>
                  <span>{activeType.title.toUpperCase()}</span>
                </div>
                <p className="tutorial-clue">{example.clue}</p>
                <div className="tutorial-progress" aria-label={`Example ${exampleIndex + 1} of ${activeType.examples.length}`}>
                  <div className="tutorial-progress-head"><span>YOUR RUN</span><span>{exampleIndex + 1} <i>/</i> {activeType.examples.length}</span></div>
                  <div className="tutorial-progress-track"><span style={{ width: `${progressPercent}%` }} /></div>
                  <div className="tutorial-progress-dots">
                    {activeType.examples.map((item, index) => (
                     <span key={item.id} className={`${index === exampleIndex ? 'is-current' : ''} ${completed.includes(item.id) ? 'is-done' : ''}`} aria-label={`Example ${index + 1}${completed.includes(item.id) ? ', completed' : ''}`} />
                    ))}
                  </div>
                </div>
                <form className="tutorial-answer-form" onSubmit={checkAnswer}>
                  <label htmlFor="tutorial-answer">Your answer</label>
                  <div className="tutorial-answer-row">
                    <input
                      id="tutorial-answer"
                      type="text"
                      autoComplete="off"
                      value={guess}
                      onChange={(event) => { setGuess(event.target.value); setChecked(null); }}
                      placeholder="Type a guess"
                      aria-describedby={checked ? 'tutorial-answer-feedback' : undefined}
                      data-testid="input-tutorial-answer"
                    />
                    <button className="button button-primary" type="submit" data-testid="button-check-answer">Check it <ArrowRight size={15} /></button>
                  </div>
                  {checked && <p id="tutorial-answer-feedback" className={`tutorial-feedback ${checked}`} role="status">
                    {checked === 'correct' ? 'That’s it. Nicely spotted.' : guess.trim() ? 'Not quite. Give the clue another look, or ask for a hint.' : 'Add a guess first, then we’ll check it.'}
                  </p>}
                </form>
                <div className="tutorial-clue-actions">
                  <button className="tutorial-text-action" type="button" onClick={() => setHintOpen((open) => !open)} aria-expanded={hintOpen} data-testid="button-toggle-hint">
                    <Lightbulb size={16} /> {hintOpen ? 'Hide hint' : 'Give me a hint'}
                  </button>
                  <button className="button tutorial-reveal-action" type="button" onClick={revealAnswer} aria-expanded={answerOpen} data-testid="button-reveal-answer">
                    <Eye size={14} /> {answerOpen ? 'Answer revealed' : 'Reveal answer'}
                  </button>
                </div>
                {hintOpen && <div className="tutorial-hint" role="note"><Lightbulb size={16} /><p><strong>A small nudge</strong>{example.hint}</p></div>}
                {answerOpen && <div className="tutorial-reveal" role="region" aria-label="Answer and explanation">
                  <div className="tutorial-answer-reveal"><span>THE ANSWER</span><strong>{example.answer}</strong></div>
                  <dl>
                    <div><dt>Definition</dt><dd>{example.definition}</dd></div>
                    <div><dt>Fodder</dt><dd>{example.fodder}</dd></div>
                    <div><dt>Indicator</dt><dd>{example.indicator}</dd></div>
                    <div><dt>Wordplay</dt><dd>{example.wordplay}</dd></div>
                  </dl>
                </div>}
                <div className="tutorial-example-nav">
                  <button type="button" className="button button-outline" onClick={() => changeExample(exampleIndex - 1)} disabled={exampleIndex === 0} data-testid="button-previous-example"><ArrowLeft size={15} /> Previous</button>
                  <button type="button" className="button tutorial-next-action" onClick={() => changeExample(exampleIndex + 1)} disabled={exampleIndex === activeType.examples.length - 1} data-testid="button-next-example">Next example <ArrowRight size={15} /></button>
                </div>
              </article>
            </div>
          </div>
          <div className="tutorial-bottom-note"><span className="tutorial-bottom-mark">CS</span><p>These original examples are dedicated under CC0 1.0 and are free to reuse. <a className="text-link" href={`${import.meta.env.BASE_URL}tutorial-content-license.txt`} target="_blank" rel="noreferrer">Read the license</a>.</p><button type="button" className="tutorial-reset" onClick={() => { setCompleted([]); changeExample(0); }}><RotateCcw size={14} /> Reset all progress</button></div>
        </div>
      </section>
    </main>
  );
}
