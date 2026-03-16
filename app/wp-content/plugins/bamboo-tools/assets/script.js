document.addEventListener('DOMContentLoaded', function () {
  init();
});

function init(){
  const section = document.querySelector('section.main');
  const tabs = section.querySelectorAll('[data-tab-index]');
  const tabsContent = section.querySelectorAll('[data-content-index]');
  const addPost = section.querySelector('[data-cpt-add-post]');
  const cptPostsContainer = section.querySelector('[data-cpt-post-list]');
  const postFieldsGroup = section.querySelector('[data-post-fields]');
  const deleteItemPost = section.querySelectorAll('[data-delete-item]');
  const url = new URL(window.location.href);

  const changeGetAttr = (activeTabTemplate) => {
    url.searchParams.set('template', activeTabTemplate);

    window.history.pushState({}, '', url);
  }

  const clearSteps = () => {
    url.searchParams.delete('step');
    window.history.pushState({}, '', url);
  }

  const tabEvents = (tab) => {
    tabs.forEach(tabItem => {
      tabItem.classList.remove('active');
    });

    tabsContent.forEach(contentItem => {
      contentItem.classList.remove('active');
    });
    
    const activeTab = tab.dataset.tabIndex;
    const activeTabContent = section.querySelector(`[data-content-index="${activeTab}"]`);

    const activeTabTemplate = activeTabContent.dataset.template;

    tab.classList.add('active');
    activeTabContent.classList.add('active');

    changeGetAttr(activeTabTemplate);
  }

  clearSteps();

  tabs.length && tabs.forEach(tab => {
    tab.addEventListener('click', e => { tabEvents(tab) });
  });

  addPost && addPost.addEventListener('click', (e) => {
    e.preventDefault();
    const newInput = document.createElement('div');
    newInput.classList.add('df', 'post-item');
    newInput.innerHTML = postFieldsGroup.innerHTML;
    const deleteItem = newInput.querySelector('button');

    cptPostsContainer.appendChild(newInput);

    deleteItem.addEventListener('click', e => {
      e.preventDefault();
      const deleteItemParent = deleteItem.closest('.post-item');
      console.log(deleteItemParent);
      deleteItemParent && deleteItemParent.remove();
    });
  });

  deleteItemPost.length && deleteItemPost.forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const deleteItem = item.closest('.post-item');
      deleteItem && deleteItem.remove();
    });
  });


  const link = document.querySelector('[data-delete-posts]');

  link.addEventListener('click', function(event) {
    const userConfirmation = confirm(`
      WARNING!
      This action will DELETE selected cpt all posts PERMANENTLY`
    );
  
    if (userConfirmation) {
      link.name = "delete_all";
    }else{
      event.preventDefault();
    }
  });

}