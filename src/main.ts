// Create a button element
const button = document.createElement('button');

// Set the button text
button.innerText = 'Click Me!';

// Add an event listener to handle click events
button.addEventListener('click', () => {
    alert('You clicked the button!');
});

// Append the button to the body of the document
document.body.appendChild(button);