let newBTN = document.querySelector('#js-new-quote'); //Number 1 
//Variable that looks for first instance of ID (assigned to specific elemnent)

newBTN.addEventListener('click', getQuote); //Number 2
//Looking for an event, then will run a function

let answerBTN = document.querySelector('#js-tweet').addEventListener('click', showAnswer);

const answerText = document.querySelector('#js-answer-text');

let current = {
    question: "",
    answer: ""
}

const endpoint = 'https://trivia.cyberwisp.com/getrandomchristmasquestion';

async function getQuote() {    //Numbers 3-5
    try {
        const response = await fetch(endpoint);    //AWAIT is wait for something to happen until a result occurs 
        if (!response.ok) {
            throw Error(response.statusText);      //When using try, it needs a catch, or endpoint
        }
        const json = await response.json();
        console.log(json);
        displayQuote(json['question']);
        current.question = json["question"];
        current.answer = json["answer"];
        
    } catch (err) {
        console.log(err)
        alert('Failed to fetch new quote');
    }
}

function displayQuote(quote) {  //Numbers 6 and 7
    const quoteText = document.querySelector('#js-quote-text');
    quoteText.textContent = quote; //On run, new variable called quote text 
    answerText.textContent = "";


    //Accossiated to #js-quote-text
    //Replace that with what we want to replace, which is the quesiton from our api
} //Dislays text of quesiton in the html id element named 'js-quote-text'

function showAnswer(){
    answerText.textContent = current.answer;
}
getQuote();
