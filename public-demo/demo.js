'use strict';

// This public sample is independent of the commercial questionnaire.
const questions = [
  { prompt: 'لو صار عندكما ساعة فاضية بالمساء، شو بتحبوا تعملوا؟', options: ['نتمشّى', 'نلعب لعبة', 'نحضّر شي ناكله'] },
  { prompt: 'كيف بتحبوا تتذكّروا يوم حلو قضيتوه مع بعض؟', options: ['بصورة', 'بكتابة ملاحظة', 'بحكاية نرجع نحكيها'] },
  { prompt: 'إذا بدكم تتعلّموا مهارة جديدة سوا، كيف بتبدأوا؟', options: ['نجرّب مباشرة', 'نحضر درس قصير', 'نسأل شخص عنده خبرة'] },
];
const people = ['الطرف الأول', 'الطرف الثاني'];
const choices = questions.map(() => ['', '']);
const form = document.getElementById('demo');
const answers = document.getElementById('answers');
const previous = document.getElementById('previous');
const next = document.getElementById('next');
const heading = document.getElementById('question');
const summary = document.getElementById('summary');
let current = 0;

function showQuestion() {
  const question = questions[current];
  heading.textContent = question.prompt;
  document.getElementById('progress').textContent = `السؤال ${current + 1} من ${questions.length}`;
  previous.disabled = current === 0;
  next.textContent = current === questions.length - 1 ? 'عرض الاختيارات' : 'التالي';
  answers.replaceChildren(...people.map((person, index) => {
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = person;
    group.append(legend);
    for (const option of question.options) {
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `person-${index}`;
      radio.value = option;
      radio.checked = choices[current][index] === option;
      radio.required = true;
      radio.addEventListener('change', () => { choices[current][index] = option; });
      label.append(radio, option);
      group.append(label);
    }
    return group;
  }));
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (current < questions.length - 1) {
    current++;
    showQuestion();
    heading.focus();
    return;
  }
  document.getElementById('discussion').replaceChildren(...questions.map((question, index) => {
    const row = document.createElement('li');
    const title = document.createElement('strong');
    const result = document.createElement('p');
    title.textContent = question.prompt;
    result.textContent = choices[index].map((choice, person) => `${people[person]}: ${choice}`).join(' · ');
    row.append(title, result);
    return row;
  }));
  summary.hidden = false;
  document.getElementById('summary-title').focus();
});

previous.addEventListener('click', () => { current--; summary.hidden = true; showQuestion(); heading.focus(); });
document.getElementById('reset').addEventListener('click', () => {
  choices.forEach(pair => pair.fill(''));
  current = 0;
  summary.hidden = true;
  showQuestion();
  heading.focus();
});

showQuestion();
