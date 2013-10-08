/* ***************************************************
 * Scenario and Action
 *****************************************************/

scenario = {};
 

// Scene class can contain a list of actions, which can be executed in order.
scenario.Scene = Backbone.Collection.extend({
    model: scenario.Action,
    
    initialize: function() {
        
        // Current action
        this._progress = 0;
        
        // Register the history of actions names, use name instead of index in collection for avoiding changement in collection, like insertion
        this.history = new Array();
        
        // Length of actions with one default chain
        this.predictLength = 0;
        
        // Length valide or not, everytime action added or deleted, link added
        this.predictLengthValid = false;
        
        // Flag to indicate if the jump action is a rollback, to avoid incorrect registration in the history
        this.rollback = false;
        
        // Current max index of action
        this.maxProgress = 0;
        
        // Scene end or not
        this.end = false;
        
        this.listenTo(this, "add", this.actionAdded);
    },
    
    get progress() {
        return this._progress;
    },
    set progress(progress) {
        if(!isNaN(progress) && progress < this.actions.length && progress >= 0) {
            this._progress = progress;
        }
    },
    
    // Real count for the current version of scene, due to multiple exits in actions, the scene can be variable because of different choices
    count: function() {
        if (!this.predictLengthValid) {
            // Calcul length
            var historyLength = this.history.length;
            var index = historyLength > 0 ? this.getActionIndex(this.history[historyLength-1]) : 0;
            var count = historyLength;
            
            while (index < this.length) {
                // Get current action
                var action = this.at(index);
                // Default, increment index
                index ++;
                // Check exits
                if (action.hasExit()) {
                    var nextname = action.getExitName();
                    var next = this.getActionIndex(nextname);
                    if (next >= 0) {
                        index = next;
                    }
                }
                count ++;
            }
            this.predictLength = count;
            this.predictLengthValid = true;
        }
        
        return this.predictLength;
    },
    
    // Check if action in progress can be reached
    directReachable: function(progress) {
        if (progress > this.maxProgress) {
            return false;
        }
        else return true;
    },
    
    // Reset all actions, reset attributes, empty history
    reset: function() {
        this.each(function(action) {
            action.reset();
        });
        
        this.history = [];
        
        this.progress = 0;
        this.predictLength = 0;
        this.predictLengthValid = false;
        this.rollback = false;
        this.maxProgress = 0;
        this.end = false;
    },
    
    // End the scene
    quit: function() {
        this.at(this.progress).quit();
        this.end = true;
    },
    
    // Run action at progress given, push to history if necessary, update max progress, run action with beginDelay
    run: function(progress) {
        if (this.end) {
            return;
        }
        // Scenario finished
        if(progress >= this.length) {
            this.quit();
            return;
        }
        
        // Switch rollback flag
        if (this.rollback) {
            this.rollback = false;
        }
        // Otherwise push the current action name to history
        else this.history.push( this.at(this.progress).get("name") );
        this.progress = progress;
        // Register max progress
        if (this.progress > this.maxProgress) {
            this.maxProgress = this.progress;
        }
        
        var action = this.at(this.progress);
        action.reset();
        
        var beginDelay = action.get("beginDelay");
        if(beginDelay) {
            _.delay(function() {
                action.start();
            }, beginDelay);
        }
        else action.start();
    },
    
    // Pass to next action will be done by ending the current action
    passNext: function() {
        if(this.progress < this.length) {
            this.at(this.progress).end();
        }
    },
    
    // Goto previous action registed in the history. End current action, retrieve the previous action in the history, mark rollback flag, and run previous
    gotoPrev: function() {
        if(this.progress > 0) {
            this.at(this.progress).end(true);
            // Goto registered previous
            var previous = this.history.pop();
            if (previous) {
                this.rollback = true;
                this.jumpToAction(previous);
            }
        }
    },
    
    // Move to next action after the current action finished.
    actionEnded: function(action) {
        // Check existance
        var id = this.indexOf(action);
        
        if(id != -1) {
            // Find exit
            var exitid = action.hasExit() ? this.getActionIndex( action.getExitName() ) : id+1;
            
            var endDelay = action.get("endDelay");
            if(endDelay > 0) {
                var scene = this;
                _.delay(function() {
                    scene.run(exitid);
                }, endDelay);
            }
            else this.run(exitid);
        }
    },
    
    // If action exit changed, the predicted length of scene is no longer valid
    actionExitChanged: function() {
        this.predictLengthValid = false;
    },
    
    
    // Jump to action at progress given
    jumpTo: function(progress) {
        var action = this.at(progress);
        
        // Action must exist and be reachable
        if ( action && this.directReachable(progress) ) {
            var name = action.get("name");
            var idHistory = this.history.indexOf(name);
            if (idHistory != -1) {
                for (var i = this.history.length-1; i > idHistory; i--) {
                    this.history.pop();
                }
                
                this.rollback = true;
            }
            
            action.end(true);
            this.run(progress);
        }
    },
    
    // Jump to action with its name
    jumpToAction: function(name) {
        var progress = this.getActionIndex(name);
        
        this.jumpTo(progress);
    },
    
    
    // Retrieve an action with name
    getAction: function(name) {
        return this.findWhere({"name": name});
    },
    
    // Retrieve the index of an action
    getActionIndex: function(name) {
        for (var i = 0; i < this.length; i++) {
            if(this.at(i).get("name") == name)
                return i;
        }
        return -1;
    },
    
    // Additional work to do when a new action added
    actionAdded: function(action) {
        action.set("scene", this);
        
        this.listenTo(action, "change:exit", this.actionExitChanged);
        
        // Predicted length no longer valide
        if (this.predictLengthValid) {
            this.predictLengthValid = false;
        }
    }
});




// Action class is a individual action. All type of action must extend this class so it will have essentially a scene, a name, a start function, an end function, optionally, multiple exits, a default exit, and begin/end delay
var Action = Backbone.Model.extend({
    
    defaults: {
        // State can be "INIT", "START", "END"
        "state": "INIT",
        
        // Scene which own this action
        "scene": null,
        
        // Possible exits list, name: exitActionName
        "exits": {},
        
        // Current exit name
        "exit": "",
        
        // This must be initialized
        "name": "",
        
        // Delay for beginning
        "beginDelay": 0,
        
        // Delay after finished
        "endDelay": 0
    },
    
    initialize: function() {
        this.autoSetExit();
        // Update new exit if necessary
        this.listenTo(this, "change:exits", this.autoSetExit);
    },
    
    // Update exit when exits changed
    autoSetExit: function() {
        var exitkeys = _.keys(this.get("exits"));
        
        // Only update if exit name not exist in new exits keys
        if ( exitkeys.length > 0 && exitkeys.indexOf(this.get("exit")) == -1 ) {
            this.set("exit", exitkeys[0]);
        }
    },
    
    // Check if there is a defined exit
    hasExit: function() {
        return this.get("exit") != "";
    },
    
    // Retrieve the exit action name
    getExitName: function() {
        return this.get("exits")[this.get("exit")] ?: "";
    },
    
    validate: function(attrs, options) {
        // Noew it's only
        if (typeof attrs.realStart != "function") {
            delete attrs["realStart"];
        }
        
        if (typeof attrs.realEnd != "function") {
            delete attrs["realEnd"];
        }
    },
    
    // Should be override by child classes
    realStart: function() {},
    realEnd: function() {},
    
    // Reset state
    reset: function() {
        this.set("state", "INIT");
    },
    
    // End the action
    quit: function() {
        this.realEnd();
        this.set("state", "END");
    },
    
    // Start action
    start: function() {
        this.set("state", "START");
        
        this.realStart();
        this.trigger("started");
    },
    
    // End action and notify scene that this action has ended, stopScena set as true will stop the notification to scene, so the scene won't continue its exit action
    end: function(stopScena, exit) {
        this.trigger("ended");
        try {
            this.realEnd();
        }
        catch (error) {
            // Do nothing, it avoid anything wrong in custom code from causing the crush of whole chain of actions
            console.error ? console.error("Action ("+this.id+": "+this.get("name")+") crashed on its end function.") : 0;
        }
        this.set("state", "END");
        
        // Exit given
        if (exit) {
            this.set("exit", exit);
        }
        
        var scene = this.get("scene");
        if(!stopScena && scene) {
            // No defined exit
            scene.actionEnded(this);
        }
    }
});
